import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { GitBranch, Clock, GitCommit, Plus, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface Prompt { id: number; name: string; content: string; }
interface Version { id: number; promptId: number; version: string; content: string; changelog: string; createdAt: string; }

export default function VersionControl() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pid, setPid] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selV, setSelV] = useState<Version | null>(null);
  const [form, setForm] = useState({ version: "", changelog: "", content: "" });

  const { data: prompts = [] } = useQuery({ queryKey: ["/api/prompts"], queryFn: async () => (await fetch("/api/prompts", { headers: getAuthHeaders() })).json() });
  const { data: versions = [] } = useQuery({ queryKey: ["/api/prompt-versions", pid], queryFn: async () => pid ? (await fetch(`/api/prompt-versions/${pid}`, { headers: getAuthHeaders() })).json() : [], enabled: !!pid });
  const createMut = useMutation({ mutationFn: async (d: any) => (await apiRequest("POST", "/api/prompt-versions", d)).json(), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/prompt-versions", pid] }); toast({ title: "Created" }); setCreateOpen(false); } });
  const rollMut = useMutation({ mutationFn: async (id: number) => { const v = versions.find((x: Version) => x.id === id); return (await apiRequest("PUT", `/api/prompts/${v.promptId}`, { content: v.content })).json(); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/prompts"] }); toast({ title: "Rolled back" }); } });
  const selP = prompts.find((p: Prompt) => p.id === parseInt(pid));

  return (<div className="py-6"><div className="max-w-7xl mx-auto px-4">
    <div className="mb-8 flex items-center justify-between"><div><h1 className="text-2xl font-bold">Version Control</h1></div><Button onClick={() => { setForm({ version: "", changelog: "", content: selP?.content || "" }); setCreateOpen(true); }} disabled={!pid}><Plus className="mr-2 h-4 w-4" />New</Button></div>
    <div className="mb-6"><Label>Select Prompt</Label><Select value={pid} onValueChange={setPid}><SelectTrigger className="w-full max-w-md mt-1"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{prompts.map((p: Prompt) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select></div>
    <Card><CardHeader><CardTitle><GitBranch className="mr-2 h-5 w-5 inline" />History</CardTitle></CardHeader><CardContent>
      {!pid ? <p className="text-center py-8 text-muted-foreground">Select a prompt</p> : versions.length === 0 ? <p className="text-center py-8 text-muted-foreground">No versions</p> :
      <div className="space-y-4">{versions.map((v: Version, i: number) => (<div key={v.id} className={`flex items-start space-x-4 p-4 border rounded-lg ${i > 0 ? "opacity-75" : ""}`}><div className={`w-8 h-8 ${i === 0 ? "bg-primary/10" : "bg-slate-100"} rounded-full flex items-center justify-center`}><GitCommit className={`h-4 w-4 ${i === 0 ? "text-primary" : ""}`} /></div><div className="flex-1"><div className="flex items-center justify-between"><div><h4 className="font-medium">{v.version}</h4><p className="text-sm text-muted-foreground">{v.changelog || "No changelog"}</p></div>{i === 0 && <Badge>Latest</Badge>}</div><div className="flex items-center mt-2 text-xs text-muted-foreground"><Clock className="mr-1 h-3 w-3" />{format(new Date(v.createdAt), "MMM d, HH:mm")}</div></div><div className="flex space-x-2"><Button variant="outline" size="sm" onClick={() => { setSelV(v); setViewOpen(true); }}>View</Button>{i > 0 && <Button variant="outline" size="sm" onClick={() => rollMut.mutate(v.id)}><RotateCcw className="h-3 w-3" /></Button>}</div></div>))}</div>}
    </CardContent></Card>
  </div>
  <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create Version</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Version</Label><Input placeholder="1.1.0" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div><div><Label>Changelog</Label><Textarea value={form.changelog} onChange={e => setForm({ ...form, changelog: e.target.value })} /></div><div><Label>Content</Label><Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} className="font-mono" /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => createMut.mutate({ promptId: parseInt(pid), ...form })}>Create</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={viewOpen} onOpenChange={setViewOpen}><DialogContent><DialogHeader><DialogTitle>{selV?.version}</DialogTitle></DialogHeader>{selV && <div><p className="text-sm mb-2">{selV.changelog || "No changelog"}</p><pre className="bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap max-h-64 overflow-auto">{selV.content}</pre></div>}<DialogFooter><Button onClick={() => setViewOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </div>);
}
