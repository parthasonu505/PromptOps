import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { TestTube, Play, Clock, Loader2 } from "lucide-react";

interface TestResult { input: string; output: string; timestamp: Date; success: boolean; responseTime: number; model: string; }

export default function TestingSandbox() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);

  const { data: providers = [] } = useQuery({ queryKey: ["/api/llm-providers"], queryFn: async () => (await fetch("/api/llm-providers", { headers: getAuthHeaders() })).json() });
  const models = providers.flatMap((p: any) => p.models.map((m: any) => ({ ...m, provider: p.name, fullId: `${p.name}:${m.id}` })));

  const testMut = useMutation({
    mutationFn: async () => {
      const [prov, modelId] = model.split(":");
      const res = await apiRequest("POST", "/api/llm/test", { provider: prov, modelId, prompt: prompt + (input ? `\n\nInput: ${input}` : ""), options: { maxTokens: 1000 } });
      return res.json();
    },
    onSuccess: (d) => {
      setResults(prev => [{ input, output: d.response || d.error || "No response", timestamp: new Date(), success: d.success, responseTime: d.responseTime || 0, model }, ...prev.slice(0, 9)]);
      toast({ title: d.success ? "Success" : "Failed", description: d.success ? `${d.responseTime}ms` : d.error, variant: d.success ? "default" : "destructive" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (<div className="py-6"><div className="max-w-7xl mx-auto px-4">
    <div className="mb-8"><h1 className="text-2xl font-bold flex items-center"><TestTube className="mr-2 h-6 w-6" />Testing Sandbox</h1><p className="text-muted-foreground mt-2">Test prompts with real LLMs.</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card><CardHeader><CardTitle>Configuration</CardTitle></CardHeader><CardContent className="space-y-4">
        <div><Label>Model</Label><Select value={model} onValueChange={setModel}><SelectTrigger className="mt-1"><SelectValue placeholder="Select model" /></SelectTrigger><SelectContent>{models.map((m: any) => <SelectItem key={m.fullId} value={m.fullId}>{m.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Prompt</Label><Textarea placeholder="Enter prompt..." className="mt-1 font-mono text-sm" rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
        <div><Label>Test Input</Label><Textarea placeholder="Optional input..." className="mt-1" rows={2} value={input} onChange={(e) => setInput(e.target.value)} /></div>
        <div className="flex space-x-2"><Button onClick={() => testMut.mutate()} disabled={!prompt || !model || testMut.isPending} className="flex-1">{testMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</> : <><Play className="mr-2 h-4 w-4" />Run</>}</Button><Button variant="outline" onClick={() => { setPrompt(""); setInput(""); setResults([]); }}>Clear</Button></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Results</CardTitle></CardHeader><CardContent>
        {results.length === 0 ? <p className="text-center py-8 text-muted-foreground">Run a test to see results</p> :
        <div className="space-y-4">{results.map((r, i) => (<div key={i} className="border rounded-lg p-4"><div className="flex items-center justify-between mb-2"><Badge className={r.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>{r.success ? "Success" : "Failed"}</Badge><span className="text-xs text-muted-foreground">{r.responseTime}ms</span></div>
          {r.input && <div className="text-sm bg-muted p-2 rounded mb-2">{r.input}</div>}
          <div className="text-sm bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">{r.output}</div>
        </div>))}</div>}
      </CardContent></Card>
    </div>
  </div></div>);
}
