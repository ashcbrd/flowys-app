import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getAppForUser, getCurrentSnapshot } from "@/lib/apps/service";
import { deriveAppForm } from "@/lib/apps/form";
import type { NodeData } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

/** The branding + run form for one app, as the person running it should see it. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const listing = await getAppForUser(id, user.id);
    if (!listing) {
      return NextResponse.json({ error: "This app isn't available." }, { status: 404 });
    }

    const branding = {
      id: listing._id,
      slug: listing.slug,
      title: listing.title,
      description: listing.description,
      icon: listing.icon,
      color: listing.color,
      category: listing.category,
    };

    const snapshot = await getCurrentSnapshot(id);
    if (!snapshot) {
      return NextResponse.json({ ...branding, published: false, fields: [] });
    }

    return NextResponse.json({
      ...branding,
      published: true,
      fields: deriveAppForm(
        { nodes: snapshot.nodes as NodeData[] },
        listing.visibleFields
      ),
    });
  } catch (error) {
    console.error("Error fetching app:", error);
    return NextResponse.json(
      { error: "This app couldn't be loaded." },
      { status: 500 }
    );
  }
}
