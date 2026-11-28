import { File } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';

import { saveTicketImage } from '../storage/photos';
import { PDFJS_LIB, PDFJS_WORKER } from './pdfjs.generated';
import { pdfPagesHtml } from './pdfPagesHtml';

interface WebHandle {
  injectJavaScript: (script: string) => void;
}
// The library's class typing doesn't fit React 19's; this is how it's used.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

/** At most this many pages of one PDF become pictures: a ticket, not the fare rules. */
const MAX_PAGES = 3;
/** Wide enough to read the small print when zoomed. */
const WIDTH = 1240;
const TIMEOUT_MS = 45_000;

interface Job {
  id: string;
  base64: string;
  pages: Promise<string>[];
  finish: (uris: string[]) => void;
}

let queue: Job[] = [];
let wake: (() => void) | null = null;

/**
 * Draws the first pages of a PDF as pictures, kept with the tickets, so a
 * PDF ticket opens at the gate like a screenshot. Done on the phone by
 * pdf.js in a hidden WebView; nothing is uploaded. Resolves with the
 * pictures' file URIs, or none if the PDF couldn't be drawn.
 */
export async function pdfPages(path: string): Promise<string[]> {
  let base64: string;
  try {
    base64 = await new File(path.includes('://') ? path : `file://${path}`).base64();
  } catch {
    return [];
  }
  return new Promise((resolve) => {
    const job: Job = { id: Math.random().toString(36).slice(2), base64, pages: [], finish: () => {} };
    const timer = setTimeout(() => job.finish([]), TIMEOUT_MS);
    let settled = false;
    job.finish = (uris) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      queue = queue.filter((j) => j !== job);
      wake?.();
      resolve(uris);
    };
    queue.push(job);
    wake?.();
  });
}

/** The hidden page that draws PDFs, there only while there are some to draw. Renders nothing visible. */
export function PdfPageRenderer() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const web = useRef<WebHandle>(null);
  const loaded = useRef(false);
  const sent = useRef(new Set<string>());
  const html = useMemo(() => (jobs.length > 0 ? pdfPagesHtml(PDFJS_LIB, PDFJS_WORKER) : ''), [jobs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    wake = () => setJobs([...queue]);
    wake();
    return () => {
      wake = null;
    };
  }, []);

  const send = () => {
    if (!loaded.current || !web.current) return;
    for (const j of queue) {
      if (sent.current.has(j.id)) continue;
      sent.current.add(j.id);
      web.current.injectJavaScript(`window.render(${JSON.stringify(j.id)}, ${JSON.stringify(j.base64)}, ${MAX_PAGES}, ${WIDTH}); true;`);
    }
  };
  useEffect(send, [jobs]);

  if (jobs.length === 0) {
    loaded.current = false;
    return null;
  }

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { id?: string; page?: number; data?: string; done?: boolean; error?: string; ready?: boolean };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.ready) {
      loaded.current = true;
      return send();
    }
    const job = queue.find((j) => j.id === m.id);
    if (!job) {
      // pdf.js itself failed to load: give up on everything waiting.
      if (m.error && !m.id) for (const j of [...queue]) j.finish([]);
      return;
    }
    if (m.data) job.pages.push(saveTicketImage(m.data));
    else if (m.done || m.error) {
      Promise.allSettled(job.pages).then((r) => job.finish(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []))));
    }
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://stashcall.invalid/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onLoadStart={() => {
          loaded.current = false;
          sent.current.clear();
        }}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 2, height: 2, opacity: 0, left: -10, top: -10 },
});
