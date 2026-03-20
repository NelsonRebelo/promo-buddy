import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { getStatus, sendVas, logout } from "@/lib/api";

type CsvRow = { advert: string; promotion: string };
type PromotionOption = { name: string; id: string };
type Result = {
  advert: string;
  promotion: string;
  success: boolean;
  status: number | string;
  errorMessage?: string;
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

function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], error: "CSV must have a header row and at least one data row." };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const ai = headers.indexOf("advert");
  const pi = headers.indexOf("promotion");

  if (ai === -1 || pi === -1) {
    return { rows: [], error: "CSV must have 'advert' and 'promotion' headers." };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const advert = cols[ai] || "";
    const promotion = cols[pi] || "";
    if (!advert || !promotion) {
      return { rows: [], error: `Row ${i + 1} has empty advert or promotion.` };
    }
    rows.push({ advert, promotion });
  }

  return { rows };
}

function getParsedMessage(errorMessage?: string): string {
  if (!errorMessage) return "";
  try {
    const parsed = JSON.parse(errorMessage);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      return parsed.message;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      typeof (parsed.error as { message?: unknown }).message === "string"
    ) {
      return (parsed.error as { message: string }).message;
    }
  } catch {
    // Ignore non-JSON strings because only parsed message values should be shown.
  }
  return "";
}

const CONCURRENCY = 5;

const Runner = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState("");
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [manualAdvertsText, setManualAdvertsText] = useState("");
  const [manualPromotionIds, setManualPromotionIds] = useState<string[]>([]);
  const [manualError, setManualError] = useState("");
  const [rowsPage, setRowsPage] = useState(1);
  const [failuresPage, setFailuresPage] = useState(1);
  const [copyingFailures, setCopyingFailures] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const failedDetailsRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const ROWS_PER_PAGE = 10;
  const FAILURES_PER_PAGE = 8;

  useEffect(() => {
    getStatus()
      .then((s) => {
        if (!s.loggedIn) navigate("/login", { replace: true });
      })
      .catch(() => navigate("/login", { replace: true }))
      .finally(() => setChecking(false));
  }, [navigate]);

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
      const { rows: parsed, error } = parseCsv(ev.target?.result as string);
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
      if (checked) {
        return prev.includes(promotionId) ? prev : [...prev, promotionId];
      }
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
        manualRows.push({ advert, promotion: promotionId });
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

  const copyFailedRequests = async () => {
    if (failures.length === 0) return;
    const clipboardText = failures
      .map((failure) => `${failure.advert}\t${getPromotionLabel(failure.promotion) || failure.promotion}`)
      .join("\n");

    try {
      setCopyingFailures(true);
      await navigator.clipboard.writeText(clipboardText);
    } finally {
      window.setTimeout(() => setCopyingFailures(false), 1200);
    }
  };

  const run = async () => {
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
          const { status: httpStatus, data } = await sendVas(row.advert, row.promotion);
          if (httpStatus === 401) {
            cancelRef.current = true;
            alert("Session expired. Please login again.");
            navigate("/login", { replace: true });
            return;
          }

          const result: Result = {
            advert: row.advert,
            promotion: row.promotion,
            success: data.success,
            status: data.status || httpStatus,
            errorMessage: data.errorMessage,
          };

          allResults.push(result);
        } catch (err: any) {
          const result: Result = {
            advert: row.advert,
            promotion: row.promotion,
            success: false,
            status: "network error",
            errorMessage: err.message || "Network error",
          };

          allResults.push(result);
        }

        setCompleted((c) => c + 1);
        setResults([...allResults]);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker());
    await Promise.all(workers);
    setRunning(false);
    setDone(true);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

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
    if (!done || progress < 100 || !failedDetailsRef.current) return;

    failedDetailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [done, progress]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          <img
            src="/promobuddy-logo.png"
            alt="Promo Buddy"
            className="h-9 w-auto rounded-full object-contain"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="section-shell relative mt-8 pb-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-8">
            <Card className="glass rounded-[2rem] border-white/80 bg-white/84 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-semibold tracking-tight">Add Adverts Manually</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-sky-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(239,246,255,0.88))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  <p className="mb-1 text-sm font-semibold text-slate-800">Warning</p>
                  <p className="text-sm leading-6 text-slate-600">
                    The VAS you are about to add is paid by the client. Be cautious and sure of what you are doing
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFile}
                  disabled={running}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center justify-end gap-3">
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
                        <Label htmlFor="manual-advert" className="sr-only">
                          Advert IDs
                        </Label>
                        <Textarea
                          id="manual-advert"
                          placeholder={"809343445\n809234234\n..."}
                          value={manualAdvertsText}
                          onChange={(e) =>
                            setManualAdvertsText(e.target.value.replace(/[^\d\r\n]/g, ""))
                          }
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
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">
                        {rows.length} row{rows.length !== 1 ? "s" : ""} loaded
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page {rowsPage} of {totalRowsPages}
                      </p>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/80">
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-14">#</TableHead>
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
                <CardTitle className="text-lg font-semibold tracking-tight">Run promotion requests</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center space-y-5 text-center">
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
                    onClick={run}
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
                  <span>
                    {completed} / {rows.length} processed
                  </span>
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
            <Card ref={failedDetailsRef} className="glass rounded-3xl border-white/75 xl:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold tracking-tight">
                    Failed promotion details
                  </CardTitle>
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
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Advert</TableHead>
                            <TableHead>Promotion</TableHead>
                            <TableHead>Message</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedFailures.map((f, i) => (
                            <TableRow key={i} className="transition-colors hover:bg-white/70">
                              <TableCell>{f.advert}</TableCell>
                              <TableCell>{getPromotionLabel(f.promotion) || f.promotion}</TableCell>
                              <TableCell className="max-w-xs truncate text-sm">
                                {getParsedMessage(f.errorMessage)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                  onClick={() => {
                    setRows([]);
                    setResults([]);
                    setDone(false);
                    setCompleted(0);
                  }}
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
    </div>
  );
};

export default Runner;
