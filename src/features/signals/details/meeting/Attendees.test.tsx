import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttendeeStack } from "./Attendees";

describe("AttendeeStack", () => {
  it("renders without crashing for a small attendee list", () => {
    render(
      <AttendeeStack
        attendees={[
          { email: "p@acme.com", name: "Priya", response: "accepted" },
        ]}
      />,
    );
    expect(screen.getByTitle("Priya")).toBeTruthy();
  });
});
