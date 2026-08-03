import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/db/models/User";
import { hashPassword } from "@/lib/password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(body?.password || "");
    const name = body?.name ? String(body.name).trim() : undefined;

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Choose a password with at least 8 characters." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    await User.create({ email, name, passwordHash });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 }
    );
  }
}
