import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  Play,
  Upload,
  X,
} from "lucide-react";
import { sendOrderPromotion } from "@/lib/api";

type OrderKind = "investment" | "offer";
type OrderMethod = "postpay" | "admin";
type CsvRow = { advert: string; promotion: string; kind: OrderKind };
type PromotionOption = { name: string; id: string };
type Result = {
  advert: string;
  promotion: string;
  kind: OrderKind;
  success: boolean;
  status: number | string;
  errorMessage?: string;
  requestDebug?: unknown;
};

const PROMOTION_OPTIONS: PromotionOption[] = [
  { name: "Exportação OLX", id: "49" },
  { name: "TOP Potências 3", id: "79" },
  { name: "TOP Potências 7", id: "83" },
  { name: "TOP Potências 15", id: "292" },
  { name: "Página Principal 3", id: "89" },
  { name: "Página Principal 7", id: "93" },
  { name: "Página Principal 15", id: "295" },
  { name: "Página Principal do OLX 7", id: "165" },
  { name: "Oportunidade do Dia 3", id: "99" },
  { name: "Oportunidade do Dia 7", id: "116" },
  { name: "Oportunidade do Dia 15", id: "296" },
  { name: "Sobressaído nas pesquisas 3", id: "69" },
  { name: "Sobressaído nas pesquisas 7", id: "73" },
  { name: "Sobressaído nas pesquisas 15", id: "293" },
  { name: "Para o Topo das pesquisas 1", id: "103" },
  { name: "Para o Topo das pesquisas 7", id: "114" },
  { name: "Para o Topo das pesquisas 15", id: "294" },
  { name: "Para o Topo das pesquisas do OLX 1", id: "163" },
  { name: "Para o Topo das pesquisas do OLX 7", id: "164" },
  { name: "Top de Anúncios do OLX 7", id: "161" },
  { name: "Top de Anúncios do OLX 28", id: "162" },
  { name: "Pacote START OLX 3", id: "187" },
  { name: "Pacote STANDARD OLX 7", id: "188" },
  { name: "Pacote PREMIUM OLX 28", id: "189" },
  { name: "Pacote Small", id: "297" },
  { name: "Pacote Medium", id: "298" },
  { name: "Pacote Large", id: "192" },
];

const EXPORT_OLX_ID = "49";
const CONCURRENCY = 5;
const REQUEST_DELAY_MS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function getOrderKindLabel(kind: OrderKind) {
  return kind === "investment" ? "Investment" : "Offer";
}

function getOrderMethod(kind: OrderKind): OrderMethod {
  return kind === "investment" ? "postpay" : "admin";
}

function parseOrderKind(value: string, fallback: OrderKind): OrderKind | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "investment" || normalized === "postpay") return "investment";
  if (normalized === "offer" || normalized === "admin") return "offer";
  return null;
}

function parseCsv(text: string, defaultKind: OrderKind): { rows: CsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], error: "CSV must have a header row and at least one data row." };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const ai = headers.indexOf("advert");
  const pi = headers.indexOf("promotion");
  const ti = ["type", "kind", "method"].map((header) => headers.indexOf(header)).find((index) => index !== -1) ?? -1;

  if (ai === -1 || pi === -1) {
    return { rows: [], error: "CSV must have 'advert' and 'promotion' headers." };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const advert = cols[ai] || "";
    const promotion = cols[pi] || "";
    const kind = parseOrderKind(ti === -1 ? "" : cols[ti] || "", defaultKind);
    if (!advert || !promotion) {
      return { rows: [], error: `Row ${i + 1} has empty advert or promotion.` };
    }
    if (!kind) {
      return { rows: [], error: `Row ${i + 1} has an invalid type. Use investment or offer.` };
    }
    rows.push({ advert, promotion, kind });
  }

  return { rows };
}

const OrderRunner = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [userUuid, setUserUuid] = useState("");
  const [manualAdvertsText, setManualAdvertsText] = useState("");
  const [manualKind, setManualKind] = useState<OrderKind>("offer");
  const [manualPromotionIds, setManualPromotionIds] = useState<string[]>([]);
  const [manualError, setManualError] = useState("");
  const [rowsPage, setRowsPage] = useState(1);
  const [failuresPage, setFailuresPage] = useState(1);
  const [copyingFailures, setCopyingFailures] = useState(false);
  const [copiedDebugKey, setCopiedDebugKey] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const ROWS_PER_PAGE = 10;
  const FAILURES_PER_PAGE = 8;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const failures = results.filter((r) => !r.success);
  const progress = rows.length > 0 ? (completed / rows.length) * 100 : 0;
  const totalRowsPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const totalFailurePages = Math.max(1, Math.ceil(failures.length / FAILURES_PER_PAGE));
  const paginatedRows = rows.slice((rowsPage - 1) * ROWS_PER_PAGE, rowsPage * ROWS_PER_PAGE);
  const paginatedFailures = failures.slice(
    (failuresPage - 1) * FAILURES_PER_PAGE,
    failuresPage * FAILURES_PER_PAGE,
  );

  useEffect(() => {
    if (!done || progress < 100 || !preparedRef.current) return;
    preparedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [done, progress]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError("");
    setRows([]);
    setResults([]);
    setDone(false);
    setCompleted(0);
    setRowsPage(1);
    setFailuresPage(1);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed, error } = parseCsv(ev.target?.result as string, manualKind);
      if (error) {
        setCsvError(error);
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const togglePromotion = (promotionId: string, checked: boolean) => {
    setManualPromotionIds((prev) => {
      if (checked) return prev.includes(promotionId) ? prev : [...prev, promotionId];
      return prev.filter((id) => id !== promotionId);
    });
  };

  const addManualRows = () => {
    const adverts = manualAdvertsText
      .split(/\r?\n/)
      .map((advert) => advert.trim())
      .filter(Boolean);

    if (adverts.length === 0 || manualPromotionIds.length === 0) {
      setManualError("Please provide at least one advert ID and one promotion.");
      return;
    }

    const manualRows: CsvRow[] = [];
    for (const advert of adverts) {
      for (const promotionId of manualPromotionIds) {
        manualRows.push({ advert, promotion: promotionId, kind: manualKind });
      }
    }

    setManualError("");
    setRows((prev) => [...prev, ...manualRows]);
    setResults([]);
    setDone(false);
    setCompleted(0);
    setRowsPage(1);
    setFailuresPage(1);
    setManualAdvertsText("");
    setManualPromotionIds([]);
  };

  const getPromotionLabel = (promotionId: string) =>
    PROMOTION_OPTIONS.find((option) => option.id === promotionId)?.name;

  const clearRows = () => {
    setRows([]);
    setResults([]);
    setDone(false);
    setCompleted(0);
    setRowsPage(1);
    setFailuresPage(1);
    setCsvError("");
    setManualError("");
    setConfirmOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyFailedRequests = async () => {
    if (failures.length === 0) return;
    const clipboardText = failures
      .map((row) => `${row.advert}\t${getPromotionLabel(row.promotion) || row.promotion}\t${getOrderKindLabel(row.kind)}`)
      .join("\n");

    try {
      setCopyingFailures(true);
      await navigator.clipboard.writeText(clipboardText);
    } finally {
      window.setTimeout(() => setCopyingFailures(false), 1200);
    }
  };

  const copyRequestDebug = async (result: Result) => {
    const key = `${result.kind}-${result.advert}-${result.promotion}`;
    const debug = result.requestDebug || {
      advert: result.advert,
      promotion: result.promotion,
      type: getOrderKindLabel(result.kind),
      method: getOrderMethod(result.kind),
      message: result.errorMessage || "No request debug was returned.",
    };

    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    setCopiedDebugKey(key);
    window.setTimeout(() => setCopiedDebugKey(""), 1200);
  };

  const openConfirm = () => {
    const normalizedUuid = userUuid.trim();
    if (!normalizedUuid) {
      setManualError("Please provide the user UUID before running.");
      return;
    }
    if (!UUID_PATTERN.test(normalizedUuid)) {
      setManualError("User UUID must be a valid UUID.");
      return;
    }
    if (!import.meta.env.VITE_ORDER_MANAGEMENT_API_KEY) {
      setManualError("Order Management API key is not configured.");
      return;
    }
    setManualError("");
    setConfirmOpen(true);
  };

  const run = async () => {
    const normalizedUuid = userUuid.trim();
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setResults([]);
    setCompleted(0);

    const allResults: Result[] = [];
    let idx = 0;

    const worker = async () => {
      while (idx < rows.length && !cancelRef.current) {
        const i = idx++;
        const row = rows[i];
        try {
          await sleep(REQUEST_DELAY_MS);
          const result = await sendOrderPromotion(
            row.advert,
            row.promotion,
            getOrderMethod(row.kind),
            normalizedUuid,
          );
          const data = result.data || {};
          const success = data.success === true;
          allResults.push({
            advert: row.advert,
            promotion: row.promotion,
            kind: row.kind,
            success,
            status: data.status ?? result.status,
            errorMessage: success
              ? undefined
              : data.errorMessage || data.message || data.error || `HTTP ${result.status}`,
            requestDebug: data.requestDebug,
          });
        } catch (error) {
          allResults.push({
            advert: row.advert,
            promotion: row.promotion,
            kind: row.kind,
            success: false,
            status: "network error",
            errorMessage: error instanceof Error ? error.message : "Network error",
          });
        } finally {
          setCompleted((c) => c + 1);
          setResults([...allResults]);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker());
    try {
      await Promise.allSettled(workers);
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  const handleExit = () => {
    navigate("/old-system", { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden pb-10">
      <div aria-hidden className="brand-blue-stage pointer-events-none absolute inset-0">
        <img
          src="https://media.licdn.com/dms/image/v2/C4D1BAQH4PUv6QKg_Ag/company-background_10000/company-background_10000/0/1591019721058/standvirtual_cover?e=1774620000&v=beta&t=h0xHSH-64Du6zwOfe6CHUOdTQiqF0_xx7Dvb8fEs2ig"
          alt=""
          className="h-full w-full scale-[1.02] object-cover object-center opacity-35 blur-xl saturate-[0.92]"
        />
        <div className="brand-blue-overlay opacity-70" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.5),rgba(241,247,255,0.82)_28%,rgba(246,249,253,0.94)_100%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/70 bg-white/72 backdrop-blur-xl">
        <div className="section-shell flex h-16 items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="rounded-full px-3">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <img src="/promobuddy-home-logo.png" alt="Promo Buddy" className="h-10 w-auto object-contain" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExit}
            className="rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Exit
          </Button>
        </div>
      </header>

      <main className="section-shell relative mt-8 pb-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-8">
            <Card className="glass rounded-[2rem] border-white/80 bg-white/84 shadow-lg">
              <CardContent className="space-y-5 py-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFile}
                  disabled={running}
                  className="hidden"
                />

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="w-full max-w-xs space-y-2">
                    <Label htmlFor="order-request-type" className="text-sm font-medium">
                      Request type
                    </Label>
                    <Select value={manualKind} onValueChange={(value) => setManualKind(value as OrderKind)} disabled={running}>
                      <SelectTrigger id="order-request-type" className="h-10 rounded-xl border-white/80 bg-white/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offer">Offer</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      New rows will be added as {getOrderKindLabel(manualKind)}.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={running}
                    className="h-9 rounded-full border-white/80 bg-white/80 px-4 text-sm"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                  </Button>
                  <Button type="button" onClick={addManualRows} disabled={running} className="h-9 rounded-full px-4">
                    Add
                  </Button>
                  </div>
                </div>

                {csvError && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{csvError}</AlertDescription>
                  </Alert>
                )}

                <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/88 shadow-sm">
                  <div className="grid grid-cols-1 border-b border-white/80 bg-white/92 text-xs font-semibold tracking-wide text-muted-foreground sm:grid-cols-2">
                    <div className="px-3 py-2">Advert IDs</div>
                    <div className="border-t border-white/80 px-3 py-2 sm:border-l sm:border-t-0">Promotions</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    <div className="p-3">
                      <div className="h-[372px] rounded-xl border border-sky-100 bg-white/96 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <Label htmlFor="order-manual-advert" className="sr-only">
                          Advert IDs
                        </Label>
                        <Textarea
                          id="order-manual-advert"
                          placeholder={"809343445\n809234234\n..."}
                          value={manualAdvertsText}
                          onChange={(e) => setManualAdvertsText(e.target.value.replace(/[^\d\r\n]/g, ""))}
                          disabled={running}
                          inputMode="numeric"
                          className="h-full overflow-y-auto rounded-xl border-white/80 bg-white"
                        />
                      </div>
                    </div>

                    <div className="border-t border-white/80 p-3 sm:border-l sm:border-t-0">
                      <div className="h-[372px] rounded-xl border border-sky-100 bg-white/96 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <div className="mb-2 flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setManualPromotionIds(PROMOTION_OPTIONS.map((option) => option.id))}
                            disabled={running}
                          >
                            Select all
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setManualPromotionIds([])}
                            disabled={running}
                          >
                            Clear
                          </Button>
                        </div>

                        <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50/80 p-2.5">
                          {PROMOTION_OPTIONS.filter((option) => option.id === EXPORT_OLX_ID).map((option) => (
                            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-sky-100/60">
                              <Checkbox
                                checked={manualPromotionIds.includes(option.id)}
                                onCheckedChange={(checked) => togglePromotion(option.id, checked === true)}
                                disabled={running}
                              />
                              <span className="font-medium">{option.name}</span>
                              <span className="text-xs text-muted-foreground">({option.id})</span>
                            </label>
                          ))}
                        </div>

                        <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">Destaques</p>
                        <div className="h-[248px] space-y-2 overflow-auto rounded-lg border border-white/80 bg-white p-2">
                          {PROMOTION_OPTIONS.filter((option) => option.id !== EXPORT_OLX_ID).map((option) => (
                            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-slate-50">
                              <Checkbox
                                checked={manualPromotionIds.includes(option.id)}
                                onCheckedChange={(checked) => togglePromotion(option.id, checked === true)}
                                disabled={running}
                              />
                              <span>{option.name}</span>
                              <span className="text-xs text-muted-foreground">({option.id})</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {manualError && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{manualError}</AlertDescription>
                  </Alert>
                )}

                {rows.length > 0 && (
                  <div className="space-y-3 rounded-2xl border border-white/80 bg-white/84 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        {rows.length} row{rows.length !== 1 ? "s" : ""} loaded
                      </p>
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-muted-foreground">
                          Page {rowsPage} of {totalRowsPages}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearRows}
                          disabled={running}
                          className="h-8 rounded-full border-white/80 bg-white/70 px-3 text-xs"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/80">
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-14">#</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Advert</TableHead>
                              <TableHead>Promotion</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedRows.map((r, i) => (
                              <TableRow key={`${r.advert}-${r.promotion}-${i}`} className="transition-colors hover:bg-white/70">
                                <TableCell className="text-muted-foreground">
                                  {(rowsPage - 1) * ROWS_PER_PAGE + i + 1}
                                </TableCell>
                                <TableCell>{getOrderKindLabel(r.kind)}</TableCell>
                                <TableCell>{r.advert}</TableCell>
                                <TableCell>
                                  {getPromotionLabel(r.promotion) ? (
                                    <span>
                                      {getPromotionLabel(r.promotion)}{" "}
                                      <span className="text-xs text-muted-foreground">({r.promotion})</span>
                                    </span>
                                  ) : (
                                    r.promotion
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    {totalRowsPages > 1 && (
                      <div className="flex items-center justify-between gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={rowsPage === 1}
                          onClick={() => setRowsPage((page) => Math.max(1, page - 1))}
                        >
                          Previous
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Showing {paginatedRows.length} of {rows.length}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={rowsPage === totalRowsPages}
                          onClick={() => setRowsPage((page) => Math.min(totalRowsPages, page + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <aside className="xl:pl-2">
            <Card className="glass rounded-3xl border-white/75 lg:sticky lg:top-24 lg:h-fit">
              <CardHeader className="pb-3 text-center">
                <CardTitle className="text-lg font-semibold tracking-tight">Run order management rows</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center space-y-5 text-center">
                <div className="w-full space-y-2 text-left">
                  <Label htmlFor="order-user-uuid" className="text-sm font-medium">
                    User UUID
                  </Label>
                  <Input
                    id="order-user-uuid"
                    value={userUuid}
                    onChange={(event) => setUserUuid(event.target.value.trim())}
                    disabled={running}
                    className="h-10 rounded-xl border-white/80 bg-white/80"
                    placeholder="9d61d25b-2312-40fd-9c60-01ca80c86711"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Mandatory. This is sent as the order user UUID.
                  </p>
                </div>
                <div className="grid w-full grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/75 bg-white/75 p-2 text-center">
                    <p className="text-[11px] tracking-wide text-muted-foreground">Progress</p>
                    <p className="text-lg font-semibold">{Math.round(progress)}%</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-2 text-center text-emerald-700">
                    <p className="text-[11px] tracking-wide">Success</p>
                    <p className="text-lg font-semibold">{successCount}</p>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/80 p-2 text-center text-rose-700">
                    <p className="text-[11px] tracking-wide">Failed</p>
                    <p className="text-lg font-semibold">{failCount}</p>
                  </div>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  <Button
                    onClick={openConfirm}
                    disabled={running || rows.length === 0}
                    className="h-11 w-full rounded-xl text-sm shadow-sm transition-all duration-300 hover:shadow-md"
                  >
                    {running ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run
                      </>
                    )}
                  </Button>

                  {running && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        cancelRef.current = true;
                      }}
                      className="h-11 w-full rounded-xl"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>

          {(running || done) && (
            <Card className="glass rounded-3xl border-white/75 xl:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold tracking-tight">Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{completed} / {rows.length} processed</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2.5 rounded-full" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/75 bg-white/70 p-3 text-center">
                    <p className="text-xs tracking-wide text-muted-foreground">Total</p>
                    <p className="mt-1 text-2xl font-semibold">{results.length}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-center text-emerald-700">
                    <p className="text-xs tracking-wide">Success</p>
                    <p className="mt-1 text-2xl font-semibold">{successCount}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-3 text-center text-rose-700">
                    <p className="text-xs tracking-wide">Failed</p>
                    <p className="mt-1 text-2xl font-semibold">{failCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {done && (
            <Card ref={preparedRef} className="glass rounded-3xl border-white/75 xl:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold tracking-tight">Failed order management details</CardTitle>
                  {failures.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyFailedRequests}
                      className="rounded-full border-white/80 bg-white/70"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {copyingFailures ? "Copied" : "Copy failed requests"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {failures.length > 0 && (
                  <div className="space-y-3 overflow-hidden rounded-2xl border border-white/75 bg-white/72 p-0">
                    <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/72 p-0">
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-center">Type</TableHead>
                              <TableHead className="text-center">Advert</TableHead>
                              <TableHead className="text-center">Promotion</TableHead>
                              <TableHead className="text-center">Message</TableHead>
                              <TableHead className="text-center">Debug</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedFailures.map((result, i) => {
                              const debugKey = `${result.kind}-${result.advert}-${result.promotion}`;
                              return (
                                <TableRow key={`${result.advert}-${result.promotion}-${i}`} className="transition-colors hover:bg-white/70">
                                  <TableCell className="text-center">{getOrderKindLabel(result.kind)}</TableCell>
                                  <TableCell className="text-center">{result.advert}</TableCell>
                                  <TableCell className="text-center">{getPromotionLabel(result.promotion) || result.promotion}</TableCell>
                                  <TableCell className="max-w-sm truncate text-center text-sm text-muted-foreground">
                                    {result.errorMessage || "Order management request failed."}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void copyRequestDebug(result)}
                                      className="rounded-full border-white/80 bg-white/70 text-xs"
                                    >
                                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                                      {copiedDebugKey === debugKey ? "Copied" : "Copy"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    {totalFailurePages > 1 && (
                      <div className="flex items-center justify-between gap-3 px-4 pb-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={failuresPage === 1}
                          onClick={() => setFailuresPage((page) => Math.max(1, page - 1))}
                        >
                          Previous
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Page {failuresPage} of {totalFailurePages}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={failuresPage === totalFailurePages}
                          onClick={() => setFailuresPage((page) => Math.min(totalFailurePages, page + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {failures.length === 0 && results.length > 0 && (
                  <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/80 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>All rows completed successfully.</AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="outline"
                  onClick={clearRows}
                  className="h-11 rounded-xl border-white/80 bg-white/60 px-5 hover:bg-white/85"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Run another list
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-2xl">
            <p className="text-center text-base leading-7 text-slate-800">
              These order management requests will be sent now. Are you sure?
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border-slate-200 bg-white px-5"
              >
                No
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false);
                  void run();
                }}
                className="rounded-full border-slate-200 bg-white px-5"
              >
                Yes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderRunner;
