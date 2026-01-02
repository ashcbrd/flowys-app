"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ShoppingCart,
  ExternalLink,
  Play,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { InputNode } from "@/components/nodes/InputNode";
import { ApiNode } from "@/components/nodes/ApiNode";
import { AiNode } from "@/components/nodes/AiNode";
import { LogicNode } from "@/components/nodes/LogicNode";
import { OutputNode } from "@/components/nodes/OutputNode";
import { IntegrationNode } from "@/components/nodes/IntegrationNode";
import { WebhookNode } from "@/components/nodes/WebhookNode";

const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "http://localhost:3002";

interface PreviewNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label?: string;
    config?: Record<string, unknown>;
  };
}

interface PreviewEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  price: number;
  currency: string;
  category: string;
  tags: string[];
  previewNodes: PreviewNode[];
  previewEdges: PreviewEdge[];
  nodeCount: number;
  purchaseCount: number;
  rating: number;
  reviewCount: number;
  seller: {
    displayName: string;
  } | null;
  hasPurchased: boolean;
  isOwner: boolean;
}

const nodeTypes = {
  input: InputNode,
  api: ApiNode,
  ai: AiNode,
  logic: LogicNode,
  output: OutputNode,
  integration: IntegrationNode,
  webhook: WebhookNode,
};

interface PageProps {
  params: Promise<{ listingId: string }>;
}

function PreviewContent({ listingId }: { listingId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  // Convert preview nodes to React Flow format
  const flowNodes = listing?.previewNodes?.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      ...node.data,
      // Mark as read-only
      readOnly: true,
    },
  })) || [];

  const flowEdges = listing?.previewEdges?.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: true,
  })) || [];

  useEffect(() => {
    // Fetch listing from marketplace API
    fetch(`${MARKETPLACE_URL}/api/marketplace/${listingId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          toast({ title: data.error, variant: "destructive" });
          router.push("/workflow");
        } else {
          setListing(data);

          // If user has purchased or is owner, redirect to actual workflow
          if (data.hasPurchased || data.isOwner) {
            // They own this workflow, redirect to it
            router.push(`/workflow`);
          }
        }
      })
      .catch(() => {
        toast({ title: "Failed to load workflow preview", variant: "destructive" });
        router.push("/workflow");
      })
      .finally(() => setLoading(false));
  }, [listingId, router, toast]);

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const res = await fetch(`${MARKETPLACE_URL}/api/marketplace/purchase/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          successUrl: `${MARKETPLACE_URL}/purchase/success?purchaseId={purchaseId}`,
        }),
      });

      const data = await res.json();

      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: data.error || "Failed to start purchase", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to start purchase", variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const formatPrice = (cents: number) => (cents / 100).toFixed(2);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`${MARKETPLACE_URL}/${listingId}`}
              className="inline-flex items-center text-sm text-white/80 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Listing
            </Link>
            <div className="h-4 w-px bg-white/30" />
            <div>
              <h1 className="text-lg font-semibold">{listing.title}</h1>
              <p className="text-xs text-white/80">
                by {listing.seller?.displayName || "Unknown"} · {listing.nodeCount} nodes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold">${formatPrice(listing.price)}</p>
              <p className="text-xs text-white/80">{listing.currency}</p>
            </div>
            <Button
              onClick={handlePurchase}
              disabled={purchasing}
              className="bg-white text-blue-600 hover:bg-white/90"
            >
              {purchasing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Purchase to Edit
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Read-only warning */}
      <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
          <Lock className="h-4 w-4" />
          <span>
            <strong>Preview Mode</strong> - This is a read-only preview. Purchase this workflow to edit and use it.
          </span>
        </div>
      </div>

      {/* Workflow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={true}
          zoomOnScroll={true}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap />
        </ReactFlow>

        {/* Floating Purchase CTA */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Ready to use this workflow?</p>
            <p className="text-lg font-bold">${formatPrice(listing.price)} one-time</p>
          </div>
          <Button onClick={handlePurchase} disabled={purchasing} size="lg">
            {purchasing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Purchase Now
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PreviewPage({ params }: PageProps) {
  const { listingId } = use(params);

  return (
    <ReactFlowProvider>
      <PreviewContent listingId={listingId} />
    </ReactFlowProvider>
  );
}
