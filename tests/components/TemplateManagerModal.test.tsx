import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TemplateManagerModal from "@/app/components/TemplateManagerModal";
import { readWordTemplate } from "@/app/lib/docx/templateReader";
import { saveCustomTemplate, getCustomTemplates } from "@/app/lib/db";

vi.mock("@/app/context/AuthContext", () => { const user = {uid:"owner"}; return {useAuth: () => ({user})}; });
vi.mock("@/app/context/GlobalUIProvider", () => ({useGlobalUI: () => ({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()},confirm:vi.fn()})}));
vi.mock("@/app/lib/db", () => ({getCustomTemplates:vi.fn(),saveCustomTemplate:vi.fn(),deleteCustomTemplate:vi.fn()}));
vi.mock("@/app/lib/docx/templateReader", () => ({readWordTemplate:vi.fn()}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCustomTemplates).mockResolvedValue([]);
  vi.mocked(saveCustomTemplate).mockResolvedValue("uploaded-template");
  vi.mocked(readWordTemplate).mockResolvedValue("## Kết quả\nVăn phong báo cáo mẫu.");
});

it("reviews a Word upload, persists the selected interpretation and selects the saved template", async () => {
  const onSelectTemplate = vi.fn();
  render(<TemplateManagerModal isOpen onClose={vi.fn()} onSelectTemplate={onSelectTemplate} />);
  const file = new File(["word"],"Báo cáo tháng.docx");
  fireEvent.change(screen.getByLabelText("Chọn file Word làm mẫu biên bản"),{target:{files:[file]}});
  await screen.findByDisplayValue("Báo cáo tháng");
  expect(screen.getByLabelText("Nội dung mẫu")).toHaveValue("## Kết quả\nVăn phong báo cáo mẫu.");
  expect(saveCustomTemplate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Cách sử dụng mẫu"),{target:{value:"example"}});
  fireEvent.click(screen.getByRole("button",{name:"Lưu mẫu mới"}));
  await waitFor(()=>expect(saveCustomTemplate).toHaveBeenCalledWith("owner",expect.objectContaining({sourceFileName:file.name,sourceMode:"example",structure:"## Kết quả\nVăn phong báo cáo mẫu."})));
  fireEvent.click(await screen.findByRole("button",{name:"Sử dụng mẫu này"}));
  expect(onSelectTemplate).toHaveBeenCalledWith(expect.objectContaining({id:"uploaded-template",sourceMode:"example"}));
});

it("shows an import error without saving or replacing the current template", async () => {
  vi.mocked(readWordTemplate).mockRejectedValue(new Error("File mẫu tối đa 5 MB."));
  render(<TemplateManagerModal isOpen onClose={vi.fn()} onSelectTemplate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Chọn file Word làm mẫu biên bản"),{target:{files:[new File(["x"],"bad.docx")]}});
  expect(await screen.findByRole("alert")).toHaveTextContent("5 MB");
  expect(saveCustomTemplate).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"Sử dụng mẫu này"})).toBeEnabled();
});
