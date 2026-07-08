import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, AlertTriangle, Lightbulb, Activity, Code, Bot, GitBranch, Zap } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Node Reference Guide</h1>
        <p className="text-muted-foreground mt-2">
          Detailed documentation on every node type, capabilities, configurations, and best practices.
        </p>
      </div>

      <div className="relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground bg-muted/50 text-foreground">
        <Lightbulb className="h-4 w-4" />
        <h5 className="mb-1 font-medium leading-none tracking-tight">General Best Practice</h5>
        <div className="text-sm [&_p]:leading-relaxed">
          When mapping inputs to nodes, always ensure that your upstream node returns the exact JSON structure you expect.
          Failing to anticipate nested objects is a common pitfall.
        </div>
      </div>

      {/* Trigger Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Trigger Node
          </CardTitle>
          <CardDescription>The entry point for any workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Supports both HTTP Webhook and Cron execution. It generates a unique, unguessable webhook URL. If you provide a standard cron expression, it schedules the workflow automatically.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li><strong>Type:</strong> Select 'webhook' or 'cron'.</li>
              <li><strong>Schedule:</strong> (Cron only) Must be a valid 5-part cron expression (e.g., <code className="bg-muted px-1 rounded">0 * * * *</code>).</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Common Mistakes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Incorrect Cron Syntax:</strong> Providing a 6-part cron (with seconds) will fail validation. Use 5 parts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* HTTP Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            HTTP Request Node
          </CardTitle>
          <CardDescription>Make external API calls seamlessly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Supports GET, POST, PUT, PATCH, and DELETE requests. You can pass dynamic variables using Handlebars syntax. Allows mapping authenticated Connection credentials directly into headers.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li><strong>Method:</strong> HTTP Verb.</li>
              <li><strong>URL:</strong> The destination endpoint. Supports handlebars <code className="bg-muted px-1 rounded">{"{{trigger.body.id}}"}</code>.</li>
              <li><strong>Body:</strong> JSON payload (parsed automatically).</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Common Mistakes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Stringifying Body Arrays:</strong> If an API expects a JSON array, ensure your payload evaluates to a valid JSON array. Escaping double quotes inside handlebars often causes malformed JSON.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            AI Step Node
          </CardTitle>
          <CardDescription>Reason over data, extract entities, or classify text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Leverages LLMs to process text and guarantees a structured JSON output. Output schema is strictly enforced via validation, allowing reliable downstream branching. Backed by semantic caching.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li><strong>Prompt:</strong> The instructions given to the LLM. Supports handlebars.</li>
              <li><strong>Output Schema:</strong> A valid JSON Schema object. The LLM is forced to return data matching this shape.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Common Mistakes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Vague Schemas:</strong> Using <code>{`{ "type": "object" }`}</code> without defining `properties` allows the LLM to return unpredictable structures, breaking downstream Branch nodes. Always define strict schema properties.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Branch Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-green-500" />
            Branch Node
          </CardTitle>
          <CardDescription>Route execution based on upstream data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Evaluates an expression and routes to different downstream nodes based on the result. It uses edge conditions.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li>Branches don&apos;t have internal config; instead, you configure the <strong>Edges</strong> connecting out of the Branch node.</li>
              <li>Click on an edge to define its `when` condition (e.g., <code className="bg-muted px-1 rounded">ai_step.sentiment === &apos;positive&apos;</code>).</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Common Mistakes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Overlapping Conditions:</strong> If two edges evaluate to true, the workflow might exhibit unexpected behavior. Ensure conditions are mutually exclusive, or define a fallback edge.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Transform Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5 text-orange-500" />
            Transform Node
          </CardTitle>
          <CardDescription>Execute lightweight sandboxed JavaScript.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Allows you to manipulate JSON, filter arrays, or format strings before passing data to the next step.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li><strong>Code:</strong> Write a JS snippet that returns a value. Upstream data is available via the `steps` object.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Common Mistakes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>Async Code:</strong> The transform node is synchronous. Attempting to use `fetch` or `setTimeout` will fail. For external calls, use the HTTP node.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Output Node */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-gray-500" />
            Output Node
          </CardTitle>
          <CardDescription>Terminate the workflow and return a response.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Capabilities & Features</h3>
            <p className="text-sm text-muted-foreground mt-1">
              If the workflow was triggered via a synchronous webhook, the Output node dictates the HTTP response body and status code sent back to the caller.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Configuration</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
              <li><strong>Body:</strong> The JSON or text to return. Supports handlebars.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
