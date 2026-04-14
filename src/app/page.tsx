import { redirect } from "next/navigation";

export default function RootPage() {
  const sessionId = crypto.randomUUID();
  redirect(`/sessions/${sessionId}`);
}
