"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginWithPassword, registerUser, loginWithGoogle, registerWithGoogle } from "@/lib/auth";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

const registerSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
  admin_username: z.string().min(1, "Admin username required"),
  admin_password: z.string().min(1, "Admin password required"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

// ── Google buttons — only rendered when provider is mounted ───────────────────

function GoogleSignInButton() {
  const router = useRouter();
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await loginWithGoogle(tokenResponse.access_token);
        router.push("/dashboard");
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Google sign-in failed");
      }
    },
    onError: () => toast.error("Google sign-in failed"),
  });
  return (
    <Button type="button" variant="secondary" className="w-full" onClick={() => googleLogin()}>
      Log in with Google
    </Button>
  );
}

function GoogleRegisterButton({ verifiedData }: { verifiedData: RegisterForm }) {
  const router = useRouter();
  const googleLink = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await registerWithGoogle({
          id_token: tokenResponse.access_token,
          username: verifiedData.username,
          password: verifiedData.password,
          admin_username: verifiedData.admin_username,
          admin_password: verifiedData.admin_password,
        });
        toast.success(`${verifiedData.username} registered with Google!`);
        router.push("/login");
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Google registration failed");
      }
    },
    onError: () => toast.error("Google sign-in failed"),
  });
  return (
    <Button type="button" variant="secondary" className="flex-1" onClick={() => googleLink()}>
      Link Google Account
    </Button>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await loginWithPassword(data);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Login failed");
    }
  };

  return (
    <Card className="w-[380px]">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome to Sizing Software</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" {...register("username")} />
            {errors.username && <p className="text-destructive text-xs">{errors.username.message}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Logging in…" : "Login"}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onSwitch}>
              Register
            </Button>
          </div>
          {GOOGLE_CLIENT_ID && <GoogleSignInButton />}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<"form" | "verified">("form");
  const [verifiedData, setVerifiedData] = useState<RegisterForm | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onVerify = async (data: RegisterForm) => {
    if (!data.admin_username || !data.admin_password) {
      toast.error("Admin credentials required");
      return;
    }
    setVerifiedData(data);
    setView("verified");
  };

  const doLocalRegister = async () => {
    if (!verifiedData) return;
    try {
      await registerUser({
        username: verifiedData.username,
        password: verifiedData.password,
        admin_username: verifiedData.admin_username,
        admin_password: verifiedData.admin_password,
      });
      toast.success(`${verifiedData.username} registered successfully! You can now login.`);
      onBack();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Registration failed");
    }
  };

  return (
    <Card className="w-[520px]">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Register</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onVerify)}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="flex flex-col gap-1">
              <Label>Username</Label>
              <Input {...register("username")} disabled={view === "verified"} />
              {errors.username && <p className="text-destructive text-xs">{errors.username.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label>Admin Username</Label>
              <Input {...register("admin_username")} disabled={view === "verified"} />
              {errors.admin_username && <p className="text-destructive text-xs">{errors.admin_username.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label>Password</Label>
              <Input type="password" {...register("password")} disabled={view === "verified"} />
              {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label>Admin Password</Label>
              <Input type="password" {...register("admin_password")} disabled={view === "verified"} />
              {errors.admin_password && <p className="text-destructive text-xs">{errors.admin_password.message}</p>}
            </div>
          </div>

          <div className="flex gap-2 pt-6">
            {view === "form" ? (
              <>
                <Button type="submit" variant="secondary" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? "Verifying…" : "Verify Admin For SignUp"}
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
                  Back to Login
                </Button>
              </>
            ) : (
              <>
                <Button type="button" className="flex-1" onClick={doLocalRegister}>
                  Register (Local Only)
                </Button>
                {GOOGLE_CLIENT_ID && verifiedData && (
                  <GoogleRegisterButton verifiedData={verifiedData} />
                )}
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AuthPages() {
  const [view, setView] = useState<"login" | "register">("login");
  return (
    <div className="flex flex-1 items-center justify-center min-h-screen">
      {view === "login"
        ? <LoginForm onSwitch={() => setView("register")} />
        : <RegisterForm onBack={() => setView("login")} />
      }
    </div>
  );
}

export default function LoginPage() {
  if (!GOOGLE_CLIENT_ID) {
    return <AuthPages />;
  }
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthPages />
    </GoogleOAuthProvider>
  );
}
