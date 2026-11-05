import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<FileQuestion />}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={
          <Button variant="primary" asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </div>
  );
}
