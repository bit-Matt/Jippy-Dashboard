"use client";

import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

import Typography from "@/components/typography";

export default function BannedPage() {
  return (
    <div className="h-lvh w-full overflow-hidden bg-red-700 px-24 py-32">
      <Ban className="size-56 mb-8 stroke-white" />
      <Typography variant="h1" className="text-white text-8xl">You are currently banned.</Typography>
      <Typography variant="h4" className="text-white text-4xl ml-5 mt-2 mb-8">
        If you think this is a mistake, please contact the Jippy administrators.
      </Typography>
      <Button variant="link" className="text-white font-bold text-2xl" asChild>
        <a href="/signout">Click here to sign-out.</a>
      </Button>
    </div>
  );
}
