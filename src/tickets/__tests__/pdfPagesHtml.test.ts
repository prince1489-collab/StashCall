import { describe, expect, it } from 'vitest';

import { pdfPagesHtml } from '../pdfPagesHtml';

describe('pdfPagesHtml', () => {
  it('keeps code holding "</script>" from ending the page’s script early', () => {
    const html = pdfPagesHtml('var a = "</script><b>";', 'var b = "</script>";');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('var a = \\"<\\/script><b>\\";');
  });
});
