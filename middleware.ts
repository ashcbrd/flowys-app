import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Protected routes that require authentication
  const protectedRoutes = ["/workflow", "/integrations", "/settings"];
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Redirect to login if trying to access protected route while not logged in
  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to workflow if already logged in and trying to access login page
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/workflow", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/workflow/:path*",
    "/integrations/:path*",
    "/settings/:path*",
    "/login",
  ],
};
