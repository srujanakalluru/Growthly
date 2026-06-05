import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { InferenceService } from '../../../../core/services/inference.service';

/**
 * Renders a single pre-generated inference HTML block by key.
 * The HTML comes from a trusted local asset, so it is bypassed for rendering.
 */
@Component({
  selector: 'app-inference-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [innerHTML]="html()"></div>`,
})
export class InferenceBlock {
  private readonly inference = inject(InferenceService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly key = input.required<string>();

  readonly html = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.inference.blocks()[this.key()] ?? ''),
  );
}
