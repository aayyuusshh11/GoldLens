import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReasonTokenLegend } from "./ReasonTokenLegend";

describe("ReasonTokenLegend — tokens only from the data it is given", () => {
  it("renders the tokens it received, verbatim and deduplicated", () => {
    render(
      <ReasonTokenLegend
        tokens={["UNVERIFIED_SPEC", "UNVERIFIED_SPEC", "ZERO_VOLUME", "STALE_PRICE"]}
      />,
    );
    expect(screen.getAllByText("unverified spec").length).toBe(1);
    expect(screen.getAllByText("zero volume").length).toBe(1);
    expect(screen.getAllByText("stale price").length).toBe(1);
  });

  it("stays honest for an empty token set instead of listing a hardcoded catalogue", () => {
    render(<ReasonTokenLegend tokens={[]} />);
    expect(
      screen.getByText(/No reason or verification codes appear in the current data/i),
    ).toBeInTheDocument();
  });

  it("renders unseen codes verbatim — never interprets them", () => {
    render(<ReasonTokenLegend tokens={["SOME_FUTURE_CODE"]} />);
    expect(screen.getByText("some future code")).toBeInTheDocument();
  });
});
