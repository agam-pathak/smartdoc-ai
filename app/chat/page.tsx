"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight,
  FileText,
  MessageSquareText,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ChatBox from "@/components/ChatBox";
import { extractPdfDocumentFromUrl } from "@/lib/clientPdfExtraction";
import type {
  ChatSource,
  IndexedDocument,
  ParsedPdfDocument,
} from "@/lib/types";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
});
const MAX_INLINE_PARSED_PDF_BYTES = 1.5 * 1024 * 1024;

function getInlineParsedPdf(parsedPdf: ParsedPdfDocument) {
  return new Blob([JSON.stringify(parsedPdf)]).size <=
    MAX_INLINE_PARSED_PDF_BYTES
    ? parsedPdf
    : null;
}

function ChatWorkspace() {
  const searchParams = useSearchParams();
  const requestedDocumentId = searchParams.get("doc");

  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [repairingDocumentId, setRepairingDocumentId] = useState("");
  const [viewerPageNumber, setViewerPageNumber] = useState(1);
  const [focusedSource, setFocusedSource] = useState<ChatSource | null>(null);
  const [mobilePane, setMobilePane] = useState<"viewer" | "chat">("chat");
  const selectedDocumentIdRef = useRef(selectedDocumentId);
  const repairedDocumentsRef = useRef(new Set<string>());

  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocumentId;
  }, [selectedDocumentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      setLoadingDocuments(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/files", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load indexed documents.");
        }

        if (cancelled) {
          return;
        }

        const nextDocuments: IndexedDocument[] = data.files ?? [];
        const nextSelectedDocumentId =
          (requestedDocumentId &&
            nextDocuments.some((document) => document.id === requestedDocumentId) &&
            requestedDocumentId) ||
          (selectedDocumentIdRef.current &&
            nextDocuments.some(
              (document) => document.id === selectedDocumentIdRef.current,
            ) &&
            selectedDocumentIdRef.current) ||
          nextDocuments[0]?.id ||
          "";

        startTransition(() => {
          setDocuments(nextDocuments);
          setSelectedDocumentId(nextSelectedDocumentId);
          setViewerPageNumber(1);
          setFocusedSource(null);
          setMobilePane(nextDocuments.length > 0 ? "chat" : "viewer");
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load documents.",
        );
      } finally {
        if (!cancelled) {
          setLoadingDocuments(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [requestedDocumentId]);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  useEffect(() => {
    if (
      !selectedDocument ||
      (selectedDocument.chunkCount > 0 &&
        selectedDocument.extractionMode !== "ocr-recommended") ||
      repairedDocumentsRef.current.has(selectedDocument.id)
    ) {
      return;
    }

    const targetDocument = selectedDocument;

    repairedDocumentsRef.current.add(targetDocument.id);
    let cancelled = false;

    async function repairSearchableText() {
      setRepairingDocumentId(targetDocument.id);

      try {
        const parsedPdf = await extractPdfDocumentFromUrl(
          `/api/files/serve?path=${encodeURIComponent(targetDocument.fileUrl)}`,
        );

        if (parsedPdf.pages.length === 0) {
          return;
        }
        const inlineParsedPdf = getInlineParsedPdf(parsedPdf);

        const response = await fetch("/api/index", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentId: targetDocument.id,
            parsedPdf: inlineParsedPdf,
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.document || cancelled) {
          return;
        }

        startTransition(() => {
          setDocuments((currentDocuments) =>
            currentDocuments.map((document) =>
              document.id === data.document.id ? data.document : document,
            ),
          );
        });
      } catch (error) {
        console.warn("Workspace auto-repair failed for searchable text.", error);
      } finally {
        if (!cancelled) {
          setRepairingDocumentId((currentId) =>
            currentId === targetDocument.id ? "" : currentId,
          );
        }
      }
    }

    void repairSearchableText();

    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  if (!loadingDocuments && documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10">
            <MessageSquareText className="h-8 w-8 text-cyan-300" />
          </div>
          <h1 className="text-2xl font-semibold text-white">
            No indexed PDFs yet
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Upload a document first, then come back to run grounded questions
            against retrieved evidence.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/upload" className="premium-button">
              Upload a PDF
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.06] px-4 py-2 xl:hidden">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setMobilePane("viewer")}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              mobilePane === "viewer"
                ? "bg-white/[0.08] text-white"
                : "text-slate-400"
            }`}
          >
            <FileText className="mr-1 inline h-3.5 w-3.5" />
            Viewer
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("chat")}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              mobilePane === "chat"
                ? "bg-white/[0.08] text-white"
                : "text-slate-400"
            }`}
          >
            <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />
            Chat
          </button>
        </div>
      </div>

      <div className="grid h-full min-h-0 grid-cols-1 gap-0 xl:grid-cols-2">
      {/* ── Left: PDF Viewer ── */}
      <section
        className={`${
          mobilePane === "viewer" ? "flex" : "hidden"
        } min-h-0 flex-col overflow-hidden border-r border-white/[0.06] xl:flex`}
      >
        {errorMessage ? (
          <p className="border-b border-rose-400/20 bg-rose-400/5 px-4 py-2 text-xs text-rose-300">
            {errorMessage}
          </p>
        ) : null}
        {repairingDocumentId === selectedDocument?.id ? (
          <p className="border-b border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs text-cyan-200">
            Rebuilding searchable text from the local PDF view...
          </p>
        ) : null}

        <PDFViewer
          key={selectedDocument?.fileUrl ?? "no-document"}
          document={selectedDocument}
          pageNumber={viewerPageNumber}
          onPageChange={setViewerPageNumber}
          focusedSource={focusedSource}
          onDocumentUpdate={(updatedDocument) =>
            setDocuments((currentDocuments) =>
              currentDocuments.map((document) =>
                document.id === updatedDocument.id ? updatedDocument : document,
              ),
            )
          }
        />
      </section>

      {/* ── Right: Chat ── */}
      <section
        className={`${
          mobilePane === "chat" ? "flex" : "hidden"
        } min-h-0 flex-col overflow-hidden xl:flex`}
      >
        <ChatBox
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          onDocumentChange={(documentId) => {
            setSelectedDocumentId(documentId);
            setViewerPageNumber(1);
            setFocusedSource(null);
            setMobilePane("viewer");
          }}
          onSourceSelect={(source) => {
            if (source.documentId && source.documentId !== selectedDocumentId) {
              setSelectedDocumentId(source.documentId);
            }

            setViewerPageNumber(source.pageStart);
            setFocusedSource(source);
            setMobilePane("viewer");
          }}
        />
      </section>
    </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading workspace…</p>
          </div>
        </div>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}
