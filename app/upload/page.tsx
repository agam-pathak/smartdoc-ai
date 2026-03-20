"use client";

import {
  ArrowRight,
  Database,
  FileSearch,
  FileStack,
  LoaderCircle,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Layers,
  FileCheck2,
  TableProperties,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

import type { IndexedDocument } from "@/lib/types";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIndexedAt(indexedAt: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(indexedAt));
}

export default function UploadPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("idle");
  const [dragActive, setDragActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [sortMode, setSortMode] = useState("recent");
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [lastIndexedDocument, setLastIndexedDocument] = useState<IndexedDocument | null>(null);

  async function loadDocuments() {
    setErrorMessage("");
    try {
      const response = await fetch("/api/files", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load indexed documents.");
      startTransition(() => {
        setDocuments(data.files ?? []);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load documents.");
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  function handleFileSelection(file: File | null) {
    setStatusMessage("");
    setErrorMessage("");
    if (!file) { setSelectedFile(null); return; }
    if (file.type !== "application/pdf") { setSelectedFile(null); setErrorMessage("Only PDF files are allowed."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setSelectedFile(null); setErrorMessage("The PDF exceeds the 15 MB upload limit."); return; }
    setSelectedFile(file);
  }

  async function uploadFile() {
    if (!selectedFile) return;
    setUploading(true);
    setErrorMessage("");
    setStatusMessage("");
    setUploadProgress(0);
    setUploadStage("uploading");
    setLastIndexedDocument(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const data = await new Promise<{ message?: string; document: IndexedDocument }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        let indexingInterval: number | null = null;

        request.open("POST", "/api/upload");

        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }

          const nextProgress = Math.min(
            78,
            Math.round((event.loaded / event.total) * 78),
          );
          setUploadProgress(nextProgress);
        };

        request.upload.onload = () => {
          setUploadStage("indexing");
          setUploadProgress(82);
          indexingInterval = window.setInterval(() => {
            setUploadProgress((current) => (current >= 96 ? current : current + 2));
          }, 260);
        };

        request.onerror = () => {
          if (indexingInterval) {
            window.clearInterval(indexingInterval);
          }
          reject(new Error("Upload failed unexpectedly."));
        };

        request.onload = () => {
          if (indexingInterval) {
            window.clearInterval(indexingInterval);
          }

          try {
            const payload = JSON.parse(request.responseText || "{}");

            if (request.status < 200 || request.status >= 300) {
              reject(new Error(payload.error || "Upload failed."));
              return;
            }

            resolve(payload);
          } catch {
            reject(new Error("Upload failed unexpectedly."));
          }
        };

        request.send(formData);
      });

      setUploadStage("ready");
      setUploadProgress(100);
      setStatusMessage(data.message || "Document uploaded successfully.");
      setLastIndexedDocument(data.document);
      setSelectedFile(null);
      await loadDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed unexpectedly.");
      setUploadStage("error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteIndexedDocument(documentId: string) {
    setDeletingDocumentId(documentId);
    try {
      const response = await fetch(`/api/files/${documentId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      await loadDocuments();
    } finally {
      setDeletingDocumentId("");
    }
  }

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    const nextDocuments = documents.filter((doc) =>
      normalizedSearch ? doc.name.toLowerCase().includes(normalizedSearch) : true
    );
    nextDocuments.sort((left, right) => {
      if (sortMode === "name") return left.name.localeCompare(right.name);
      if (sortMode === "pages") return right.pageCount - left.pageCount;
      return Date.parse(right.indexedAt || "") - Date.parse(left.indexedAt || "");
    });
    return nextDocuments;
  }, [documents, searchValue, sortMode]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
      {/* ── HEADER ── */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between px-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
            <Database className="h-3.5 w-3.5" /> Library Console
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">System Inventory</h1>
          <p className="text-base text-slate-500 max-w-lg leading-relaxed font-medium">Manage your indexed PDF collection and track RAG grounding health across your assets.</p>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-slate-400 shadow-inner">
             <FileStack className="h-4 w-4 text-cyan-400" />
             <span className="font-bold text-slate-200">{documents.length}</span> Documents
           </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        {/* ── DOCUMENT LIST ── */}
        <div className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center bg-slate-950/20 p-2 rounded-2xl border border-white/5">
             <div className="relative flex-1">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
               <input 
                 value={searchValue}
                 onChange={(e) => setSearchValue(e.target.value)}
                 placeholder="Search indexed assets by name..." 
                 className="w-full rounded-xl border border-white/5 bg-slate-950/40 pl-11 pr-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-400/30 transition-all placeholder:text-slate-700" 
               />
             </div>
             <select 
               value={sortMode}
               onChange={(e) => setSortMode(e.target.value)}
               className="rounded-xl border border-white/5 bg-slate-950/40 px-5 py-3 text-sm text-slate-300 outline-none hover:border-white/10 transition-all cursor-pointer"
             >
                <option value="recent">Sort: Recent</option>
                <option value="name">Sort: Name</option>
                <option value="pages">Sort: Page Count</option>
             </select>
          </div>

          <div className="grid gap-4">
             {filteredDocuments.length === 0 ? (
               <div className="rounded-[2.5rem] border border-dashed border-white/10 bg-white/[0.02] py-32 text-center">
                 <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">No matching results in library</p>
               </div>
             ) : (
               filteredDocuments.map((doc) => (
                 <div key={doc.id} className="group relative rounded-[2rem] border border-white/[0.06] bg-slate-950/40 px-6 py-6 transition hover:border-cyan-400/30 hover:bg-slate-950/60 shadow-lg">
                    <div className="flex items-start justify-between gap-6">
                       <div className="min-w-0 flex-1 flex gap-5">
                          <div className="mt-1 h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl bg-white/5 text-slate-500 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition-colors">
                             <FileCheck2 className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="truncate text-lg font-bold text-white group-hover:text-cyan-400 transition-colors mb-2">{doc.name}</h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase font-bold tracking-[0.15em] text-slate-500">
                               <span className="flex items-center gap-1.5"><TableProperties className="h-3 w-3" /> {doc.pageCount} Pages</span>
                               <span className="opacity-30">|</span>
                               <span>{formatBytes(doc.sizeBytes)}</span>
                               <span className="opacity-30">|</span>
                               <span>Indexed {formatIndexedAt(doc.indexedAt)}</span>
                            </div>
                          </div>
                       </div>
                       <div className="flex items-center gap-2">
                          <Link href={`/chat?doc=${doc.id}`} title="Open in Workspace" className="rounded-xl p-3 text-slate-500 hover:bg-cyan-500/10 hover:text-cyan-400 transition-all">
                             <ArrowRight className="h-5 w-5" />
                          </Link>
                          <button 
                            onClick={() => deleteIndexedDocument(doc.id)}
                            disabled={deletingDocumentId === doc.id}
                            title="Delete Document"
                            className="rounded-xl p-3 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                          >
                             {deletingDocumentId === doc.id ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                          </button>
                       </div>
                    </div>
                 </div>
               ))
             )}
          </div>
        </div>

        {/* ── UPLOAD AREA ── */}
        <aside className="space-y-8">
           <div className={`relative flex min-h-[440px] flex-col items-center justify-center rounded-[3rem] border-2 border-dashed border-white/10 bg-slate-950/40 px-8 py-16 text-center transition-all ${dragActive ? "border-cyan-400 bg-cyan-400/5 ring-8 ring-cyan-400/5" : "hover:border-white/20 hover:bg-slate-950/60 shadow-2xl shadow-black/20"}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFileSelection(e.dataTransfer.files?.[0]); }}
           >
              <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-cyan-400/10 text-cyan-400 shadow-xl shadow-cyan-900/10">
                <UploadCloud className="h-10 w-10" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Drop Asset</h3>
              <p className="text-sm leading-relaxed text-slate-500 max-w-[200px] mx-auto font-medium">Selective indexing for documents up to 15MB.</p>
              
              <input 
                type="file" 
                accept=".pdf" 
                onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                className="absolute inset-0 cursor-pointer opacity-0" 
              />
              
              {selectedFile && (
                <div className="mt-10 w-full rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="truncate text-xs font-bold text-cyan-300">{selectedFile.name}</p>
                  <p className="mt-2 text-[10px] uppercase font-bold tracking-widest text-slate-600">{formatBytes(selectedFile.size)} • PDF MIME</p>
                </div>
              )}

              {uploading && (
                <div className="mt-8 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    <span>{uploadStage === "indexing" ? "Indexing" : "Uploading"}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {uploadStage === "indexing"
                      ? "Parsing pages, running OCR when needed, and preparing retrieval vectors."
                      : "Streaming the PDF into the private workspace."}
                  </p>
                </div>
              )}
           </div>

           <button 
             onClick={uploadFile}
             disabled={!selectedFile || uploading}
             className="flex w-full items-center justify-center gap-3 rounded-[2rem] bg-gradient-to-br from-cyan-500 to-blue-600 py-5 text-sm font-bold text-white shadow-xl shadow-cyan-900/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale disabled:scale-100"
           >
             {uploading ? <LoaderCircle className="animate-spin h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
             {uploading ? "Indexing Document..." : "Index Library Asset"}
           </button>

           <div className="rounded-[2rem] border border-white/5 bg-slate-950/20 p-8 space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                 <Layers className="h-3.5 w-3.5" /> Pipeline Status
              </div>
              <ul className="space-y-3 text-[10px] font-bold uppercase tracking-widest text-slate-600 leading-6">
                 <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-cyan-400" /> Private Cloud Storage: Ready</li>
                 <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-cyan-400" /> Vector Manifest: Active</li>
                 <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-cyan-400" /> Reasoning Hook: Online</li>
              </ul>
           </div>

           {lastIndexedDocument ? (
             <div className="rounded-[2rem] border border-cyan-400/10 bg-cyan-400/5 p-8 space-y-4">
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">
                 <FileSearch className="h-3.5 w-3.5" /> Latest Index
               </div>
               <div>
                 <h3 className="text-lg font-bold text-white">{lastIndexedDocument.name}</h3>
                 <p className="mt-2 text-sm text-slate-400">
                   {lastIndexedDocument.pageCount} pages • {lastIndexedDocument.chunkCount} chunks • {lastIndexedDocument.embeddingModel}
                 </p>
               </div>
               {lastIndexedDocument.extractionMode === "ocr-recommended" ? (
                 <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
                   This file looks scan-heavy. It was kept in the workspace, but grounded answers may be limited until OCR is available.
                 </p>
               ) : lastIndexedDocument.extractionMode === "ocr" ? (
                 <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100">
                   OCR completed for low-text pages. The file is ready for grounded chat, but verify critical quotes and figures against the viewer.
                 </p>
               ) : (
                 <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
                   Extraction completed cleanly and the file is ready for grounded chat.
                 </p>
               )}
               <button
                 type="button"
                 onClick={() => router.push(`/chat?doc=${lastIndexedDocument.id}`)}
                 className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110"
               >
                 Open In Workspace
                 <ArrowRight className="h-3.5 w-3.5" />
               </button>
             </div>
           ) : null}
        </aside>
      </div>

      {statusMessage && <div className="fixed bottom-10 right-10 rounded-2xl bg-emerald-500 px-8 py-4 text-sm font-bold text-white shadow-2xl shadow-emerald-900/30 animate-in fade-in slide-in-from-right-10 duration-500">{statusMessage}</div>}
      {errorMessage && <div className="fixed bottom-10 right-10 rounded-2xl bg-rose-500 px-8 py-4 text-sm font-bold text-white shadow-2xl shadow-rose-900/30 animate-in fade-in slide-in-from-right-10 duration-500">{errorMessage}</div>}
    </div>
  );
}
