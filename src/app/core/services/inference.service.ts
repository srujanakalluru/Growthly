import { Injectable, signal } from '@angular/core';

/**
 * Loads the pre-generated medical inference blocks (`inference.json`) that fill
 * the narrative slots in the report.
 */
@Injectable({ providedIn: 'root' })
export class InferenceService {
  private readonly _blocks = signal<Record<string, string>>({});
  readonly blocks = this._blocks.asReadonly();

  async load(): Promise<void> {
    try {
      const res = await fetch('inference/inference.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      this._blocks.set((await res.json()) as Record<string, string>);
    } catch (err) {
      console.error('Error loading inference data:', err);
    }
  }

  get(key: string): string {
    return this._blocks()[key] ?? '';
  }
}
