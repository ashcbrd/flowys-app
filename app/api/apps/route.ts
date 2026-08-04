import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase, Workflow } from "@/lib/db";
import { AppListing } from "@/lib/db/models/AppListing";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { publishApp } from "@/lib/apps/service";

const CreateAppSchema = z.object({
  workflowId: z.string().min(1),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  category: z.string().optional(),
  visibleFields: z.array(z.string()).optional(),
  slug: z.string().optional(),
});

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

/** The caller's own apps, newest activity first. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const workspaceId = await getOrCreatePersonalWorkspace(user.id);

    const listings = await AppListing.find({
      workspaceId,
      status: { $ne: "unpublished" },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json(
      listings.map((listing) => ({
        id: listing._id,
        slug: listing.slug,
        title: listing.title,
        description: listing.description,
        icon: listing.icon,
        color: listing.color,
        category: listing.category,
        status: listing.status,
        updatedAt: listing.updatedAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching apps:", error);
    return NextResponse.json(
      { error: "Couldn't load your apps." },
      { status: 500 }
    );
  }
}

/** Turn one of the caller's own workflows into a published, runnable app. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const body = await request.json();
    const parsed = CreateAppSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That app couldn't be saved. Please check the details and try again." },
        { status: 400 }
      );
    }

    const { workflowId, title, description, icon, color, category, visibleFields, slug } =
      parsed.data;

    const workflow = await Workflow.findById(workflowId).lean();
    if (!workflow || workflow.userId !== user.id) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const workspaceId = await getOrCreatePersonalWorkspace(user.id);

    let listing;
    try {
      listing = await AppListing.create({
        workspaceId,
        workflowId,
        ownerUserId: user.id,
        slug: slug ? slugify(slug) : slugify(title),
        title,
        description,
        icon,
        color,
        category,
        visibleFields: visibleFields || [],
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return NextResponse.json(
          { error: "You already have an app with that name." },
          { status: 409 }
        );
      }
      throw err;
    }

    await publishApp(listing._id, user.id);

    return NextResponse.json(
      { id: listing._id, slug: listing.slug, title: listing.title },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating app:", error);
    return NextResponse.json(
      { error: "This app couldn't be created." },
      { status: 500 }
    );
  }
}
