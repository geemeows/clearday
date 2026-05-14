// Reusable "Join meeting" button: opens the video link in a new tab.

import { VideoIcon } from "lucide-react";
import { Button } from "#/components/ui/button";

type Props = {
  href: string;
  label?: string;
};

export function MeetingJoinButton({ href, label = "Join" }: Props) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Button variant="default" size="sm">
        <VideoIcon />
        {label}
      </Button>
    </a>
  );
}
