import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

export async function chooseFromDownloadMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: "Download worksheet" }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}
