import { v4 as uuidv4 } from "uuid";
import {
  connectToDatabase,
  Workflow,
  MarketplaceListing,
  Purchase,
  SellerProfile,
  type NodeData,
  type EdgeData,
} from "@/lib/db";

/**
 * Remap node and edge IDs to create unique copies
 */
export function remapWorkflowIds(
  nodes: NodeData[],
  edges: EdgeData[]
): { nodes: NodeData[]; edges: EdgeData[] } {
  const timestamp = Date.now();
  const nodeIdMap = new Map<string, string>();

  // Generate new node IDs
  const newNodes = nodes.map((node) => {
    const newId = `${node.type}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    nodeIdMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
    };
  });

  // Remap edge source/target references
  const newEdges = edges.map((edge, index) => ({
    ...edge,
    id: `edge_${timestamp}_${index}`,
    source: nodeIdMap.get(edge.source) || edge.source,
    target: nodeIdMap.get(edge.target) || edge.target,
  }));

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Copy a purchased workflow to the buyer's account
 * Uses the workflow snapshot stored at listing time (not the original workflow)
 */
export async function copyWorkflowToBuyer(
  listingId: string,
  buyerId: string,
  purchaseId: string
): Promise<string> {
  await connectToDatabase();

  // Get the listing with the workflow snapshot
  const listing = await MarketplaceListing.findById(listingId);
  if (!listing) {
    throw new Error("Listing not found");
  }

  // Use the workflow snapshot (immutable copy from listing time)
  let snapshot = listing.workflowSnapshot;

  // Fallback: If no snapshot exists, try to get the original workflow
  if (!snapshot || !snapshot.nodes || !snapshot.edges) {
    console.warn(`Listing ${listingId} missing workflowSnapshot, falling back to original workflow`);
    const originalWorkflow = await Workflow.findById(listing.workflowId);
    if (!originalWorkflow) {
      throw new Error("Workflow not found - the original workflow may have been deleted");
    }
    snapshot = {
      name: originalWorkflow.name,
      description: originalWorkflow.description,
      nodes: originalWorkflow.nodes,
      edges: originalWorkflow.edges,
    };
  }

  // Remap IDs to avoid conflicts
  const { nodes, edges } = remapWorkflowIds(snapshot.nodes, snapshot.edges);

  // Create new workflow for the buyer with purchase tracking
  const newWorkflowId = uuidv4();
  const newWorkflow = await Workflow.create({
    _id: newWorkflowId,
    userId: buyerId,
    name: `${snapshot.name} (Purchased)`,
    description: snapshot.description,
    nodes,
    edges,
    // Mark as purchased - this unlocks premium nodes for this workflow
    isPurchased: true,
    purchaseId: purchaseId,
    originalListingId: listingId,
  });

  // Update the purchase record with the copied workflow ID
  await Purchase.findByIdAndUpdate(purchaseId, {
    copiedWorkflowId: newWorkflow._id,
  });

  // Update listing stats
  await MarketplaceListing.findByIdAndUpdate(listingId, {
    $inc: { purchaseCount: 1 },
  });

  // Update seller stats
  const purchase = await Purchase.findById(purchaseId);
  if (purchase) {
    await SellerProfile.findOneAndUpdate(
      { userId: listing.sellerId },
      {
        $inc: {
          totalSales: 1,
          totalEarnings: purchase.sellerPayout,
        },
      }
    );
  }

  return newWorkflow._id.toString();
}

/**
 * Check if a user has already purchased a listing
 */
export async function hasUserPurchased(
  buyerId: string,
  listingId: string
): Promise<boolean> {
  await connectToDatabase();

  const existingPurchase = await Purchase.findOne({
    buyerId,
    listingId,
    status: { $in: ["pending", "completed"] },
  });

  return !!existingPurchase;
}
