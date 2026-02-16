import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Play, X, LogOut, CheckCircle2, XCircle } from "lucide-react";
import { getStatus, sendVas, logout } from "@/lib/api";

type CsvRow = { advert: string; promotion: string };
type Result = { advert: string; promotion: string; success: boolean; status: number | string; errorMessage?: string };
type LogEntry = { index: number; advert: string; promotion: string; success: boolean; message: string };

function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "CSV must have a header row and at least one data row." };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const ai = headers.indexOf("advert");
  const pi = headers.indexOf("promotion");

  if (ai === -1 || pi === -1) return { rows: [], error: "CSV must have 'advert' and 'promotion' headers." };

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const advert = cols[ai] || "";
    const promotion = cols[pi] || "";
    if (!advert || !promotion) return { rows: [], error: `Row ${i + 1} has empty advert or promotion.` };
    rows.push({ advert, promotion });
  }
  return { rows };
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    getStatus()
      .then((s) => { if (!s.loggedIn) navigate("/login", { replace: true }); })
      .catch(() => navigate("/login", { replace: true }))
      .finally(() => setChecking(false));
  }, [navigate]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError("");
    setRows([]);
    setResults([]);
    setLogs([]);
    setDone(false);
    setCompleted(0);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed, error } = parseCsv(ev.target?.result as string);
      if (error) { setCsvError(error); return; }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const run = async () => {
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setResults([]);
    setLogs([]);
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
          addLog({
            index: i,
            advert: row.advert,
            promotion: row.promotion,
            success: data.success,
            message: data.success ? "OK" : (data.errorMessage || `Error ${data.status}`),
          });
        } catch (err: any) {
          const result: Result = {
            advert: row.advert,
            promotion: row.promotion,
            success: false,
            status: "network error",
            errorMessage: err.message || "Network error",
          };
          allResults.push(result);
          addLog({ index: i, advert: row.advert, promotion: row.promotion, success: false, message: "Network error" });
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

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const failures = results.filter((r) => !r.success);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">Bulk VAS Runner</h1>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4">
        {/* CSV Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input type="file" accept=".csv" onChange={handleFile} disabled={running} className="max-w-xs" />
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            {csvError && (
              <Alert variant="destructive"><AlertDescription>{csvError}</AlertDescription></Alert>
            )}
            {rows.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  {rows.length} row{rows.length !== 1 ? "s" : ""} loaded
                </p>
                <div className="max-h-64 overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Advert</TableHead>
                        <TableHead>Promotion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 20).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>{r.advert}</TableCell>
                          <TableCell>{r.promotion}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 20 && (
                  <p className="text-xs text-muted-foreground">Showing first 20 of {rows.length} rows</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Run Controls */}
        {rows.length > 0 && !done && (
          <div className="flex gap-3">
            <Button onClick={run} disabled={running}>
              {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</> : <><Play className="mr-2 h-4 w-4" />Run VAS Requests</>}
            </Button>
            {running && (
              <Button variant="destructive" onClick={() => { cancelRef.current = true; }}>
                <X className="mr-2 h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        )}

        {/* Progress */}
        {(running || done) && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span>{completed} / {rows.length} processed</span>
                <span>{Math.round((completed / rows.length) * 100)}%</span>
              </div>
              <Progress value={(completed / rows.length) * 100} />
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" />{successCount} success</span>
                <span className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />{failCount} failed</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Logs */}
        {logs.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Live Log</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-48 space-y-1 overflow-auto font-mono text-xs">
                {logs.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant={l.success ? "default" : "destructive"} className="text-[10px]">
                      {l.success ? "OK" : "FAIL"}
                    </Badge>
                    <span className="text-muted-foreground">#{l.index + 1}</span>
                    <span>{l.advert} → {l.promotion}</span>
                    {!l.success && <span className="text-destructive">({l.message})</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Summary */}
        {done && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{results.length}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{successCount}</div>
                  <div className="text-xs text-muted-foreground">Success</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-destructive">{failCount}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              {failures.length > 0 && (
                <div className="overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Advert</TableHead>
                        <TableHead>Promotion</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failures.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell>{f.advert}</TableCell>
                          <TableCell>{f.promotion}</TableCell>
                          <TableCell><Badge variant="destructive">{f.status}</Badge></TableCell>
                          <TableCell className="max-w-xs truncate text-sm">{f.errorMessage}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <Button variant="outline" onClick={() => {
                setRows([]);
                setResults([]);
                setLogs([]);
                setDone(false);
                setCompleted(0);
              }}>
                <Upload className="mr-2 h-4 w-4" /> Upload New CSV
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Runner;
