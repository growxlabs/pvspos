'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useRef } from 'react';

interface ReceiptPreviewProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  saleData?: any;
  sale?: any;
  onClose?: () => void;
}

export function ReceiptPreview({
  open,
  onOpenChange,
  saleData,
  sale,
  onClose,
}: ReceiptPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const data = saleData || sale;

  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCloseModal = () => {
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  const isControlledDialog = typeof open === 'boolean';

  const content = (
    <div className="printable-receipt p-6 bg-white text-black font-mono text-xs space-y-4 rounded-xl border shadow-inner max-h-[60vh] overflow-y-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="font-bold text-base tracking-tight">PVS SUPERMARKET POS</h2>
        <p className="text-[10px]">123 Retail Hub, GSTIN: 27AAAAA0000A1Z5</p>
        <p className="text-[10px]">Ph: +91 98765 43210</p>
        <div className="border-b border-dashed my-2" />
      </div>

      {/* Invoice Info */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Invoice #:</span>
          <span className="font-bold">{data.invoiceNumber || 'INV-0001'}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{new Date(data.createdAt || Date.now()).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{data.customerName || 'Walk-in Customer'}</span>
        </div>
        <div className="flex justify-between">
          <span>Payment Mode:</span>
          <span className="font-bold">{data.paymentMethod}</span>
        </div>
      </div>

      <div className="border-b border-dashed my-2" />

      {/* Items Table */}
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between font-bold border-b pb-1">
          <span className="w-1/2">Item</span>
          <span className="w-1/4 text-center">Qty</span>
          <span className="w-1/4 text-right">Total</span>
        </div>

        {data.items?.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between text-[11px]">
            <span className="w-1/2 truncate">{item.productName}</span>
            <span className="w-1/4 text-center">{item.quantity}</span>
            <span className="w-1/4 text-right">₹{((item.unitPrice || item.price || 0) * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-dashed my-2" />

      {/* Totals */}
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(Number(data.subtotal) || 0)}</span>
        </div>
        {Number(data.taxAmount) > 0 && (
          <div className="flex justify-between">
            <span>GST Tax:</span>
            <span>{formatCurrency(Number(data.taxAmount) || 0)}</span>
          </div>
        )}
        {Number(data.discountAmount) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{formatCurrency(Number(data.discountAmount))}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t pt-1">
          <span>GRAND TOTAL:</span>
          <span>{formatCurrency(Number(data.total) || 0)}</span>
        </div>
      </div>

      <div className="border-b border-dashed my-2" />

      {/* Footer Note */}
      <div className="text-center text-[10px] text-gray-600 space-y-1 pt-1">
        <p>Thank you for shopping with us!</p>
      </div>
    </div>
  );

  if (isControlledDialog) {
    return (
      <Dialog open={open} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-lg">
              🧾 Receipt & Invoice
            </DialogTitle>
          </DialogHeader>

          {content}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="w-full" onClick={handleCloseModal}>
              Close
            </Button>
            <Button className="w-full bg-primary text-primary-foreground font-bold" onClick={handlePrint}>
              🖨 Print Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background p-6 rounded-xl max-w-md w-full space-y-4 shadow-2xl">
        <h3 className="text-center font-bold text-lg">🧾 Receipt Preview</h3>
        {content}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="w-full" onClick={handleCloseModal}>
            Close
          </Button>
          <Button className="w-full bg-primary text-primary-foreground font-bold" onClick={handlePrint}>
            🖨 Print Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
