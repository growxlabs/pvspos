import 'server-only';
import { prisma } from '@/lib/prisma/client';
import { CheckoutPayload } from '../types/billing.types';

export const billingService = {
  async checkout(userId: string, data: CheckoutPayload) {
    return prisma.$transaction(
      async (tx) => {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const productIds = data.items.map((i) => i.productId);

        // 1. Concurrently fetch today's sale count, profile GST setting, and all products in cart
        const [count, profile, products] = await Promise.all([
          tx.sale.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          }),
          tx.profile.findUnique({
            where: { id: userId },
            select: { gstEnabled: true },
          }),
          tx.product.findMany({
            where: { id: { in: productIds } },
            include: { inventory: true },
          }),
        ]);

        const invoiceNumber = `INV-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;
        const gstEnabled = profile?.gstEnabled !== false;

        const productMap = new Map(products.map((p) => [p.id, p]));

        // 2. Aggregate quantities by productId to avoid race conditions & duplicate decrements
        const qtyByProductId = new Map<string, number>();
        for (const item of data.items) {
          qtyByProductId.set(
            item.productId,
            (qtyByProductId.get(item.productId) || 0) + item.quantity
          );
        }

        // Validate stock for all items
        for (const [productId, totalQty] of qtyByProductId.entries()) {
          const product = productMap.get(productId);
          if (!product) {
            throw new Error(`Product not found (ID: ${productId})`);
          }
          if (!product.inventory || product.inventory.quantity < totalQty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Available: ${product.inventory?.quantity || 0}, Requested: ${totalQty}`
            );
          }
        }

        // 3. Calculate line items and totals in memory
        let subtotal = 0;
        let taxAmount = 0;
        const saleItemsData = [];

        for (const item of data.items) {
          const product = productMap.get(item.productId)!;
          const itemTotal = item.unitPrice * item.quantity;
          const itemTax = gstEnabled ? (itemTotal * item.taxRate) / 100 : 0;

          subtotal += itemTotal;
          taxAmount += itemTax;

          saleItemsData.push({
            productId: product.id,
            productName: product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: itemTax,
            discount: 0,
            total: itemTotal + itemTax,
          });
        }

        // 4. Batch decrement inventory concurrently (one atomic update per unique product)
        await Promise.all(
          Array.from(qtyByProductId.entries()).map(([productId, totalQty]) =>
            tx.inventory.update({
              where: { productId },
              data: { quantity: { decrement: totalQty } },
            })
          )
        );

        const total = subtotal + taxAmount - (data.discount || 0);

        // 5. Create Sale record with nested saleItems
        const sale = await tx.sale.create({
          data: {
            invoiceNumber,
            subtotal,
            taxAmount,
            discountAmount: data.discount || 0,
            total,
            paymentMethod: data.paymentMethod,
            paymentStatus: 'COMPLETED',
            notes: data.notes,
            profile: {
              connect: { id: userId },
            },
            saleItems: {
              create: saleItemsData,
            },
          },
          include: { saleItems: true },
        });

        return sale;
      },
      {
        maxWait: 10000, // 10s connection wait
        timeout: 30000, // 30s transaction timeout to prevent unexpected disconnects
      }
    );
  },
};
