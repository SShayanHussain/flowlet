"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function VerifyEmailHandler() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    !token ? "error" : "loading"
  );
  const [errorMessage, setErrorMessage] = useState(
    !token ? "Missing verification token." : ""
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message || "Verification failed");
        }

        setStatus("success");
      } catch (error: unknown) {
        setStatus("error");
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("An unknown error occurred");
        }
      }
    }

    verify();
  }, [token]);

  if (status === "loading") {
    return (
      <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Verifying your email address...</p>
      </CardContent>
    );
  }

  if (status === "success") {
    return (
      <>
        <CardContent className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">Email Verified</h3>
            <p className="text-muted-foreground">Your email address has been successfully verified.</p>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/dashboard" className={cn(buttonVariants())}>Go to Dashboard</Link>
        </CardFooter>
      </>
    );
  }

  return (
    <>
      <CardContent className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
        <XCircle className="h-16 w-16 text-destructive" />
        <div className="space-y-1">
          <h3 className="font-semibold text-lg text-destructive">Verification Failed</h3>
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>Return to login</Link>
      </CardFooter>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Card className="w-full shadow-xl shadow-primary/5 border-border/50">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">Email Verification</CardTitle>
      </CardHeader>
      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <VerifyEmailHandler />
      </Suspense>
    </Card>
  );
}
