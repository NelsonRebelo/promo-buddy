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
  Loader2,
  LogOut,
  Play,
  Upload,
  X,
  XCircle,
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
  const cancelRef = useRef(false);

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
    setManualAdvertsText("");
    setManualPromotionIds([]);
  };

  const getPromotionLabel = (promotionId: string) =>
    PROMOTION_OPTIONS.find((option) => option.id === promotionId)?.name;

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

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const failures = results.filter((r) => !r.success);
  const progress = rows.length > 0 ? (completed / rows.length) * 100 : 0;

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-50 border-b border-white/70 bg-white/72 backdrop-blur-xl">
        <div className="section-shell flex h-16 items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="rounded-full px-3">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">Promo Buddy</span>
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

      <main className="section-shell mt-8 space-y-8 pb-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Card className="glass rounded-3xl border-white/75">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-semibold tracking-tight">Upload CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Alert className="rounded-2xl border-amber-200 bg-amber-50/90 text-amber-900">
                  <AlertDescription>
                    The VAS you are about to add is paid by the client. Be cautious and sure of what you are doing
                  </AlertDescription>
                </Alert>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleFile}
                      disabled={running}
                      className="h-11 max-w-full rounded-xl bg-white/90 sm:max-w-sm"
                    />
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Upload className="h-4 w-4" strokeWidth={1.8} />
                      <span>Headers required: advert, promotion</span>
                    </div>
                  </div>
                </div>

                {csvError && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{csvError}</AlertDescription>
                  </Alert>
                )}

                {rows.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">
                      {rows.length} row{rows.length !== 1 ? "s" : ""} loaded
                    </p>
                    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/75">
                      <div className="max-h-72 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-14">#</TableHead>
                              <TableHead>Advert</TableHead>
                              <TableHead>Promotion</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.slice(0, 20).map((r, i) => (
                              <TableRow key={i} className="transition-colors hover:bg-white/70">
                                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
                    {rows.length > 20 && (
                      <p className="text-xs text-muted-foreground">Showing first 20 of {rows.length} rows</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="glass rounded-3xl border-white/75">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-semibold tracking-tight">Add Adverts Manually</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-end">
                  <Button type="button" onClick={addManualRows} disabled={running} className="h-9 rounded-lg px-4">
                    Add
                  </Button>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/80 bg-white/85">
                  <div className="grid grid-cols-1 border-b border-white/80 bg-white/90 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-2">
                    <div className="px-3 py-2">Advert IDs</div>
                    <div className="border-t border-white/80 px-3 py-2 sm:border-l sm:border-t-0">Promotions</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    <div className="p-3">
                      <div className="h-full rounded-lg border border-slate-200 bg-white/95 p-2">
                        <Label htmlFor="manual-advert" className="sr-only">
                          Advert IDs
                        </Label>
                        <Textarea
                          id="manual-advert"
                          placeholder={"809343445\n809234234\n..."}
                          value={manualAdvertsText}
                          onChange={(e) => setManualAdvertsText(e.target.value)}
                          disabled={running}
                          className="h-[300px] rounded-lg border-white/80 bg-white"
                        />
                      </div>
                    </div>

                    <div className="border-t border-white/80 p-3 sm:border-l sm:border-t-0">
                      <div className="h-full rounded-lg border border-slate-200 bg-white/95 p-2">
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
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            Serviço Independente
                          </p>
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

                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Promoções Regulares
                        </p>
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
              </CardContent>
            </Card>
          </div>

          <Card className="glass rounded-3xl border-white/75 xl:sticky xl:top-24 xl:h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold tracking-tight">Run Promotion Resquests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/75 bg-white/75 p-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rows</p>
                  <p className="text-lg font-semibold">{rows.length}</p>
                </div>
                <div className="rounded-xl border border-white/75 bg-white/75 p-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Done</p>
                  <p className="text-lg font-semibold">{completed}</p>
                </div>
                <div className="rounded-xl border border-white/75 bg-white/75 p-2 text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">%</p>
                  <p className="text-lg font-semibold">{Math.round(progress)}</p>
                </div>
              </div>
              <div className="space-y-2">
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
                      Run VAS Requests
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
        </section>

        {(running || done) && (
          <Card className="glass rounded-3xl border-white/75">
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="mt-1 text-2xl font-semibold">{results.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-center text-emerald-700">
                  <p className="text-xs uppercase tracking-wide">Success</p>
                  <p className="mt-1 text-2xl font-semibold">{successCount}</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-3 text-center text-rose-700">
                  <p className="text-xs uppercase tracking-wide">Failed</p>
                  <p className="mt-1 text-2xl font-semibold">{failCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {done && (
          <Card className="glass rounded-3xl border-white/75">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold tracking-tight">Results Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {failures.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/72">
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
                        {failures.map((f, i) => (
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
                Upload New CSV
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Runner;
