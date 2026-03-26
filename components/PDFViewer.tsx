"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSearch,
  FileWarning,
  Layers,
  Loader2,
  Minus,
  NotebookPen,
  Plus,
  SearchCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { ChatSource, IndexedDocument } from "@/lib/types";

// The workerSrc is set inside the component to avoid SSR errors.

type ViewerPanel = "source" | "notes" | "bookmarks";

type PDFViewerProps = {
  document: IndexedDocument | null;
  pageNumber: number;
  onPageChange: (pageNumber: number) => void;
  focusedSource?: ChatSource | null;
  onDocumentUpdate?: (document: IndexedDocument) => void;
};

function toProtectedUrl(fileUrl: string): string {
  return `/api/files/serve?path=${encodeURIComponent(fileUrl)}`;
}

function formatPageRange(pageStart: number, pageEnd: number) {
  return pageStart === pageEnd ? `p.${pageStart}` : `pp.${pageStart}-${pageEnd}`;
}

function buildThumbnailPages(
  pageCount: number,
  currentPage: number,
  bookmarkedPages: number[],
) {
  if (pageCount <= 0) {
    return [];
  }

  const pages = new Set<number>([
    1,
    pageCount,
    currentPage,
    currentPage - 1,
    currentPage + 1,
    currentPage - 2,
    currentPage + 2,
    ...bookmarkedPages,
  ]);

  return [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
}

function extractHighlightTerms(source: ChatSource | null) {
  if (!source) {
    return [];
  }

  return [...new Set(
    source.excerpt
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  )].slice(0, 8);
}

export default function PDFViewer({
  document,
  pageNumber,
  onPageChange,
  focusedSource = null,
  onDocumentUpdate,
}: PDFViewerProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(680);
  const [zoom, setZoom] = useState(1);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [activePanel, setActivePanel] = useState<ViewerPanel>("source");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    // Standard CDN worker for production reliability on Vercel
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  }, []);
  const fileUrl = document?.fileUrl ?? null;
  const bookmarkedPages = useMemo(
    () => document?.bookmarkedPages ?? [],
    [document?.bookmarkedPages],
  );

  useEffect(() => {
    setNotesDraft(document?.notes ?? "");
  }, [document?.id, document?.notes]);

  useEffect(() => {
    const node = frameRef.current;

    if (!node) {
      return undefined;
    }

    const updateWidth = () => {
      setPageWidth(Math.max(280, Math.floor(node.clientWidth - 32)));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!document?.id) {
      return;
    }

    void fetch(`/api/files/${document.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lastOpenedAt: new Date().toISOString(),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.document) {
          onDocumentUpdate?.(data.document);
        }
      })
      .catch(() => undefined);
  }, [document?.id, onDocumentUpdate]);

  const safePageNumber =
    pageCount > 0 ? Math.min(Math.max(pageNumber, 1), pageCount) : pageNumber;
  const highlightTerms = useMemo(
    () =>
      focusedSource &&
      safePageNumber >= focusedSource.pageStart &&
      safePageNumber <= focusedSource.pageEnd
        ? extractHighlightTerms(focusedSource)
        : [],
    [focusedSource, safePageNumber],
  );
  const thumbnailPages = useMemo(
    () => buildThumbnailPages(pageCount, safePageNumber, bookmarkedPages),
    [bookmarkedPages, pageCount, safePageNumber],
  );

  useEffect(() => {
    const pageNode = pageContainerRef.current;

    if (!pageNode) {
      return;
    }

    const highlight = () => {
      const spans = pageNode.querySelectorAll<HTMLSpanElement>(
        ".react-pdf__Page__textContent span",
      );

      spans.forEach((span) => {
        span.style.backgroundColor = "";
        span.style.borderRadius = "";
        span.style.boxShadow = "";
      });

      if (highlightTerms.length === 0) {
        return;
      }

      spans.forEach((span) => {
        const text = span.textContent?.toLowerCase() ?? "";

        if (highlightTerms.some((term) => text.includes(term))) {
          span.style.backgroundColor = "rgba(34, 211, 238, 0.25)";
          span.style.borderRadius = "4px";
          span.style.boxShadow = "0 0 0 1px rgba(34, 211, 238, 0.18)";
        }
      });
    };

    const timeout = window.setTimeout(highlight, 120);
    return () => window.clearTimeout(timeout);
  }, [highlightTerms, safePageNumber, fileUrl, zoom]);

  async function saveDocumentPatch(
    payload: Partial<Pick<IndexedDocument, "notes" | "bookmarkedPages">>,
  ) {
    if (!document?.id) {
      return;
    }

    const response = await fetch(`/api/files/${document.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to update the document.");
    }

    if (data.document) {
      onDocumentUpdate?.(data.document);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);

    try {
      await saveDocumentPatch({ notes: notesDraft });
    } finally {
      setSavingNotes(false);
    }
  }

  async function toggleBookmark(page: number) {
    if (!document) {
      return;
    }

    const nextBookmarkedPages = bookmarkedPages.includes(page)
      ? bookmarkedPages.filter((entry) => entry !== page)
      : [...bookmarkedPages, page].sort((left, right) => left - right);

    await saveDocumentPatch({
      bookmarkedPages: nextBookmarkedPages,
    });
  }

  async function reindex(forceOcr = false) {
    if (!document?.id || reindexing) {
      return;
    }

    setReindexing(true);

    try {
      const response = await fetch("/api/index", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: document.id,
          forceOcr,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Reindex failed.");
      }

      if (data.document) {
        onDocumentUpdate?.(data.document);
      }
    } catch (error) {
      console.warn("Manual reindex failed.", error);
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-white">
              {document?.name ?? "Select a document"}
            </h2>
            {document?.extractionMode === "ocr-recommended" ? (
              <button
                type="button"
                onClick={() => void reindex(true)}
                disabled={reindexing}
                className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
              >
                {reindexing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileWarning className="h-3 w-3" />
                )}
                {reindexing ? "Deep Scanning..." : "Deep Scan Recommended"}
              </button>
            ) : document?.extractionMode === "ocr" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                <SearchCheck className="h-3 w-3" />
                OCR indexed
              </span>
            ) : null}
          </div>
          {focusedSource ? (
            <span className="mt-1 text-[11px] text-cyan-300">
              Focused: {formatPageRange(focusedSource.pageStart, focusedSource.pageEnd)}
            </span>
          ) : null}
        </div>

        {fileUrl && pageCount > 0 ? (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-1.5 py-1 text-xs">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, safePageNumber - 1))}
                disabled={safePageNumber <= 1}
                className="rounded p-1 transition hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-slate-300" />
              </button>
              <span className="px-1.5 font-mono text-[11px] text-slate-300">
                Pg {safePageNumber} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(pageCount, safePageNumber + 1))}
                disabled={safePageNumber >= pageCount}
                className="rounded p-1 transition hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              </button>
            </div>

            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-1.5 py-1">
              <button
                type="button"
                onClick={() =>
                  setZoom((value) => Math.max(0.6, +(value - 0.1).toFixed(1)))
                }
                className="rounded p-1 transition hover:bg-white/10"
              >
                <Minus className="h-3.5 w-3.5 text-slate-300" />
              </button>
              <span className="px-1 font-mono text-[11px] text-slate-300">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setZoom((value) => Math.min(2, +(value + 0.1).toFixed(1)))
                }
                className="rounded p-1 transition hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5 text-slate-300" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowThumbnails((value) => !value)}
              className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Layers className="h-3.5 w-3.5" />
              {showThumbnails ? "Hide rail" : "Show rail"}
            </button>

            <button
              type="button"
              onClick={() => void toggleBookmark(safePageNumber)}
              className={`flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] transition ${
                bookmarkedPages.includes(safePageNumber)
                  ? "bg-amber-400/10 text-amber-300"
                  : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Bookmark
            </button>

            <Link
              href={toProtectedUrl(fileUrl)}
              target="_blank"
              className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Link>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showThumbnails && fileUrl && pageCount > 0 ? (
          <aside className="hidden w-32 shrink-0 border-r border-white/[0.06] bg-[rgba(6,8,16,0.72)] p-2 md:block">
            <div className="space-y-2 overflow-y-auto pr-1">
              {thumbnailPages.map((thumbnailPage) => (
                <button
                  key={thumbnailPage}
                  type="button"
                  onClick={() => onPageChange(thumbnailPage)}
                  className={`w-full rounded-xl border p-1.5 text-left transition ${
                    thumbnailPage === safePageNumber
                      ? "border-cyan-400/30 bg-cyan-400/8"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-white/12"
                  }`}
                >
                  <Document file={toProtectedUrl(fileUrl)} loading={null} error={null}>
                    <Page
                      pageNumber={thumbnailPage}
                      width={88}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Page {thumbnailPage}</span>
                    {bookmarkedPages.includes(thumbnailPage) ? (
                      <Star className="h-3 w-3 text-amber-300" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <div
          ref={frameRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[rgba(4,6,14,0.5)]"
        >
          <div className="flex-1 overflow-auto p-4">
            {fileUrl ? (
              <div
                ref={pageContainerRef}
                className="flex min-h-full items-start justify-center"
              >
                <Document
                  file={toProtectedUrl(fileUrl)}
                  loading={
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <LoaderDots /> Loading document…
                    </div>
                  }
                  error={
                    <p className="text-sm text-rose-300">
                      The PDF preview could not be rendered.
                    </p>
                  }
                  onLoadSuccess={({ numPages }) => {
                    setPageCount(numPages);
                    if (safePageNumber > numPages) {
                      onPageChange(numPages);
                    }
                  }}
                >
                  <Page
                    pageNumber={safePageNumber}
                    width={Math.min(pageWidth, 900)}
                    scale={zoom}
                    renderAnnotationLayer
                    renderTextLayer
                    className="pdf-page-shadow"
                  />
                </Document>
              </div>
            ) : (
              <div className="flex max-w-xs flex-col items-center pt-20 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                  <FileSearch className="h-7 w-7" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">
                  No document selected
                </h3>
                <p className="text-sm leading-6 text-slate-400">
                  Pick an indexed PDF to keep the source visible while you chat.
                </p>
              </div>
            )}
          </div>

          {document ? (
            <div className="border-t border-white/[0.06] bg-[rgba(6,8,16,0.76)] px-4 py-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActivePanel("source")}
                  className={`rounded-lg px-3 py-1.5 text-[11px] transition ${
                    activePanel === "source"
                      ? "bg-cyan-400/12 text-cyan-200"
                      : "bg-white/[0.03] text-slate-400 hover:text-white"
                  }`}
                >
                  <SearchCheck className="mr-1 inline h-3.5 w-3.5" />
                  Source
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel("notes")}
                  className={`rounded-lg px-3 py-1.5 text-[11px] transition ${
                    activePanel === "notes"
                      ? "bg-cyan-400/12 text-cyan-200"
                      : "bg-white/[0.03] text-slate-400 hover:text-white"
                  }`}
                >
                  <NotebookPen className="mr-1 inline h-3.5 w-3.5" />
                  Notes
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel("bookmarks")}
                  className={`rounded-lg px-3 py-1.5 text-[11px] transition ${
                    activePanel === "bookmarks"
                      ? "bg-cyan-400/12 text-cyan-200"
                      : "bg-white/[0.03] text-slate-400 hover:text-white"
                  }`}
                >
                  <Bookmark className="mr-1 inline h-3.5 w-3.5" />
                  Bookmarks
                </button>
              </div>

              {activePanel === "source" ? (
                focusedSource ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {focusedSource.source}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {formatPageRange(
                              focusedSource.pageStart,
                              focusedSource.pageEnd,
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleBookmark(focusedSource.pageStart)}
                          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 transition hover:text-white"
                        >
                          Save page
                        </button>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {focusedSource.excerpt}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[11px] text-slate-400">
                      <p className="font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Retrieval
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span>Score</span>
                          <span className="font-mono text-slate-200">
                            {focusedSource.score}
                          </span>
                        </div>
                        {focusedSource.documentRank ? (
                          <div className="flex items-center justify-between">
                            <span>Doc rank</span>
                            <span className="font-mono text-slate-200">
                              #{focusedSource.documentRank}
                            </span>
                          </div>
                        ) : null}
                        {focusedSource.documentHitCount ? (
                          <div className="flex items-center justify-between">
                            <span>Hits in doc</span>
                            <span className="font-mono text-slate-200">
                              {focusedSource.documentHitCount}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-slate-400">
                    Select a citation to inspect the excerpt, highlighted terms, and page metadata.
                  </div>
                )
              ) : null}

              {activePanel === "notes" ? (
                <div className="space-y-3">
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    placeholder="Capture document-specific notes, follow-ups, or decisions."
                    className="min-h-[140px] w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-400/30"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-500">
                      Notes are saved per document in your workspace manifest.
                    </p>
                    <button
                      type="button"
                      onClick={() => void saveNotes()}
                      disabled={savingNotes}
                      className="rounded-xl bg-cyan-500 px-4 py-2 text-[11px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
                    >
                      {savingNotes ? "Saving..." : "Save notes"}
                    </button>
                  </div>
                </div>
              ) : null}

              {activePanel === "bookmarks" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {bookmarkedPages.map((bookmarkedPage) => (
                      <button
                        key={bookmarkedPage}
                        type="button"
                        onClick={() => onPageChange(bookmarkedPage)}
                        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300 transition hover:text-white"
                      >
                        Page {bookmarkedPage}
                      </button>
                    ))}
                    {bookmarkedPages.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No saved pages yet. Bookmark the current page or a cited page.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleBookmark(safePageNumber)}
                    className="rounded-xl border border-cyan-400/20 bg-cyan-400/6 px-4 py-2 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
                  >
                    {bookmarkedPages.includes(safePageNumber)
                      ? "Remove current page"
                      : "Bookmark current page"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoaderDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 delay-75" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 delay-150" />
    </span>
  );
}
