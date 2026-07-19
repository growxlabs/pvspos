import { prisma } from '@/lib/prisma/client';

export interface AIRequest {
  systemPrompt?: string;
  prompt: string;
  isJson?: boolean;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  name: string;
  generate(req: AIRequest): Promise<AIResponse>;
}

// 1. Gemini API Keys Rotator
class GeminiKeyRotator {
  private keys: string[] = [];
  private currentIndex = 0;

  constructor() {
    const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
  }

  getCurrentKey(): string {
    if (this.keys.length === 0) return '';
    return this.keys[this.currentIndex] || '';
  }

  rotate(): string {
    if (this.keys.length <= 1) return this.getCurrentKey();
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(`[AI-Router] Rotated to Gemini API key index ${this.currentIndex}`);
    return this.getCurrentKey();
  }

  hasKeys(): boolean {
    return this.keys.length > 0;
  }
}

const keyRotator = new GeminiKeyRotator();

// 2. Health Monitor for Providers
class HealthMonitor {
  private consecutiveFailures = new Map<string, number>();
  private lastFailureTime = new Map<string, number>();

  recordSuccess(provider: string) {
    this.consecutiveFailures.set(provider, 0);
  }

  recordFailure(provider: string) {
    const failures = (this.consecutiveFailures.get(provider) || 0) + 1;
    this.consecutiveFailures.set(provider, failures);
    this.lastFailureTime.set(provider, Date.now());
    console.warn(`[AI-Router] Recorded failure for ${provider}. Consecutive failures: ${failures}`);
  }

  isHealthy(provider: string): boolean {
    const failures = this.consecutiveFailures.get(provider) || 0;
    if (failures >= 3) {
      const lastFail = this.lastFailureTime.get(provider) || 0;
      const cooldown = 2 * 60 * 1000; // 2 minutes cooldown
      if (Date.now() - lastFail < cooldown) {
        return false;
      }
      // Reset failures after cooldown
      this.consecutiveFailures.set(provider, 0);
    }
    return true;
  }
}

const healthMonitor = new HealthMonitor();

// 3. Cache Manager
interface CacheEntry {
  response: AIResponse;
  expiry: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry>();

  get(key: string): AIResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(key: string, val: AIResponse, ttlSeconds: number = 45): void {
    this.cache.set(key, {
      response: val,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }
}

const cacheManager = new CacheManager();

// 4. Gemini Provider
class GeminiProvider implements AIProvider {
  name = 'Gemini';

  async generate(req: AIRequest): Promise<AIResponse> {
    if (!keyRotator.hasKeys()) {
      throw new Error('No Gemini API keys configured.');
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const apiKey = keyRotator.getCurrentKey();
      const modelName = attempts === 0 ? 'gemini-2.5-flash' : 'gemini-1.5-flash';
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const parts = [];
        if (req.systemPrompt) {
          parts.push({ text: req.systemPrompt });
        }
        parts.push({ text: req.prompt });

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMessage = errText;
          try {
            const errJson = JSON.parse(errText);
            errMessage = errJson.error?.message || errText;
          } catch {}

          // If rate limit or quota exceeded, rotate key immediately and retry
          if (response.status === 429 || errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('rate limit')) {
            console.warn(`[AI-Router] Key rate limited/quota hit on ${modelName}. Rotating key...`);
            keyRotator.rotate();
            attempts++;
            continue;
          }
          throw new Error(errMessage);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        healthMonitor.recordSuccess(this.name);
        return {
          text,
          provider: this.name,
          model: modelName
        };
      } catch (err: any) {
        console.error(`[AI-Router] Gemini attempt ${attempts + 1} (${modelName}) failed:`, err.message);
        keyRotator.rotate();
        attempts++;
        if (attempts >= maxAttempts) {
          healthMonitor.recordFailure(this.name);
          throw err;
        }
        // Exponential backoff delay
        await new Promise(res => setTimeout(res, Math.pow(2, attempts) * 1000));
      }
    }

    throw new Error('Gemini execution failed after maximum retries');
  }
}

// 5. OpenRouter Provider
class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter';
  private fallbackModels = [
    'deepseek/deepseek-chat',            // DeepSeek V3 (Paid, extremely cheap, fast & reliable)
    'google/gemini-2.5-flash',           // Gemini 2.5 Flash via OpenRouter (Paid)
    'meta-llama/llama-3.3-70b-instruct', // Llama 3.3 70B (Paid, highly smart)
    'qwen/qwen-2.5-72b-instruct:free',   // Qwen 72B (Free fallback)
    'deepseek/deepseek-r1:free'          // DeepSeek R1 (Free fallback)
  ];

  async generate(req: AIRequest): Promise<AIResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key is missing.');
    }

    for (const model of this.fallbackModels) {
      try {
        console.log(`[AI-Router] Trying fallback OpenRouter model: ${model}`);
        const messages = [];
        if (req.systemPrompt) {
          messages.push({ role: 'system', content: req.systemPrompt });
        }
        messages.push({ role: 'user', content: req.prompt });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://pvs.martt.growxlabs.tech',
            'X-Title': 'PVS POS Enterprise AI'
          },
          body: JSON.stringify({
            model,
            messages
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter returned status ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        if (!text) {
          throw new Error('Empty response from model');
        }

        healthMonitor.recordSuccess(this.name);
        return {
          text,
          provider: this.name,
          model
        };
      } catch (err: any) {
        console.warn(`[AI-Router] OpenRouter model ${model} failed:`, err.message);
        // Continue to next model
      }
    }

    healthMonitor.recordFailure(this.name);
    throw new Error('All OpenRouter fallback models failed.');
  }
}

// 6. Router Orchestrator
class RouterService {
  private geminiProvider = new GeminiProvider();
  private openRouterProvider = new OpenRouterProvider();

  async generate(req: AIRequest): Promise<AIResponse> {
    // 1. Caching check for common text queries to avoid API calls
    const cacheKey = `${req.systemPrompt || ''}:${req.prompt}`;
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      console.log('[AI-Router] Serving response from in-memory cache');
      return cached;
    }

    // 2. Try Gemini (Primary Provider) if healthy
    if (healthMonitor.isHealthy(this.geminiProvider.name) && keyRotator.hasKeys()) {
      try {
        console.log('[AI-Router] Routing to Gemini (Primary)');
        const res = await this.geminiProvider.generate(req);
        // Cache successful responses for 45s
        cacheManager.set(cacheKey, res);
        return res;
      } catch (err: any) {
        console.warn('[AI-Router] Primary Gemini failed, attempting OpenRouter fallback...', err.message);
      }
    }

    // 3. Try OpenRouter (Secondary Provider / Fallback)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
      try {
        console.log('[AI-Router] Routing to OpenRouter (Secondary)');
        const res = await this.openRouterProvider.generate(req);
        // Cache successful responses for 45s
        cacheManager.set(cacheKey, res);
        return res;
      } catch (err: any) {
        console.error('[AI-Router] Fallback OpenRouter also failed:', err.message);
      }
    }

    // 4. Hard fail with user-friendly alert
    throw new Error("I'm temporarily having trouble reaching the AI service. Please try again in a few moments.");
  }
}

export const routerService = new RouterService();
