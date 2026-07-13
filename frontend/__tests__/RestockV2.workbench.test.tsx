import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockV2 } from "../modules/RestockV2";
import api from "../src/api";
import * as targetSkuUtils from "../modules/restock/utils/restockTargetSku";

vi.mock("../src/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));

const storeInventory = vi.hoisted(() => [
  { id: "target-1", sku: "X8-BLACK", name: "Black case" },
  { id: "target-2", sku: "X8-WHITE", name: "White case" },
]);
const storeProducts = vi.hoisted(
  (): Array<{ id: string; sku: string; name: string }> => [],
);

vi.mock("../StoreContext", () => ({
  useStore: () => ({
    inventory: storeInventory,
    products: storeProducts,
  }),
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockedPatch = api.patch as unknown as ReturnType<typeof vi.fn>;
const mockedPut = api.put as unknown as ReturnType<typeof vi.fn>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const pendingImport = {
  import: {
    id: "import-1",
    site: "PH",
    fileName: "orders.xlsx",
    statisticsDays: 30,
    createdAt: "2026-07-10T00:00:00.000Z",
  },
  items: [
    {
      id: "item-1",
      platformSku: "X8-BLACQ",
      sourceSku: "X8_BLACK",
      validSales: 12,
      title: "Title only for review",
      spec: "Black",
      targetSku: null,
    },
  ],
  pending: [
    {
      id: "item-1",
      platformSku: "X8-BLACQ",
      sourceSku: "X8_BLACK",
      validSales: 12,
      title: "Title only for review",
      spec: "Black",
      targetSku: null,
    },
  ],
};

describe("RestockV2 stationized mapping workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [
              {
                code: "PH",
                label: "菲律宾",
                productCount: 1,
                warehouseCodes: ["PH-1"],
              },
              {
                code: "MY",
                label: "马来西亚",
                productCount: 1,
                warehouseCodes: ["MY-1"],
              },
            ],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({ data: pendingImport });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      if (url === "/restock-v2/sales-imports/import-1")
        return Promise.resolve({ data: pendingImport });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedPatch.mockResolvedValue({
      data: { dismissedAt: "2026-07-10T00:00:00.000Z" },
    });
    mockedPut.mockResolvedValue({ data: {} });
  });

  it("shows a percentage for review candidates", async () => {
    render(<RestockV2 />);

    const trigger = await screen.findByTestId("target-sku-select-item-1");
    await waitFor(() => expect(trigger).toHaveTextContent("X8-BLACK"));
    expect(screen.getAllByText("86%").length).toBeGreaterThan(0);
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it("automatically saves a unique 100-percent SKU mapping", async () => {
    const exactImport = {
      ...pendingImport,
      items: [{ ...pendingImport.items[0], platformSku: "X8_BLACK" }],
      pending: [{ ...pendingImport.pending[0], platformSku: "X8_BLACK" }],
    };
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [{ code: "PH", label: "菲律宾", productCount: 1, warehouseCodes: ["PH-1"] }],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({ data: exactImport });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.resolve({ data: exactImport });
    });

    render(<RestockV2 />);

    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/import-1/items/item-1/mapping",
        { targetSku: "X8-BLACK" },
      ),
    );
    expect(await screen.findByText("已自动匹配 1 条 100% SKU。"))
      .toBeInTheDocument();
  });

  it("keeps ambiguous 100-percent candidates for manual review", async () => {
    storeInventory.push({ id: "target-3", sku: "X8_BLACK", name: "Alternate black case" });
    const ambiguousImport = {
      ...pendingImport,
      items: [{ ...pendingImport.items[0], platformSku: "X8/BLACK" }],
      pending: [{ ...pendingImport.pending[0], platformSku: "X8/BLACK" }],
    };
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [{ code: "PH", label: "菲律宾", productCount: 1, warehouseCodes: ["PH-1"] }],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({ data: ambiguousImport });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.resolve({ data: ambiguousImport });
    });
    try {
      render(<RestockV2 />);
      const trigger = await screen.findByTestId("target-sku-select-item-1");
      expect(trigger).toHaveTextContent("100%");
      await act(async () => undefined);
      expect(mockedPut).not.toHaveBeenCalled();
    } finally {
      storeInventory.pop();
    }
  });

  it("does not use the source SKU to rank or default a candidate when the platform SKU is missing", async () => {
    const rankSpy = vi.spyOn(targetSkuUtils, "rankRestockTargetSkus");
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [
              {
                code: "PH",
                label: "菲律宾",
                productCount: 1,
                warehouseCodes: ["PH-1"],
              },
            ],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({
          data: {
            ...pendingImport,
            items: [
              {
                ...pendingImport.items[0],
                platformSku: null,
                sourceSku: "X8_BLACK",
              },
            ],
            pending: [
              {
                ...pendingImport.pending[0],
                platformSku: null,
                sourceSku: "X8_BLACK",
              },
            ],
          },
        });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.resolve({ data: pendingImport });
    });

    render(<RestockV2 />);

    expect(await screen.findByText("X8_BLACK")).toBeInTheDocument();
    const trigger = screen.getByTestId("target-sku-select-item-1");
    expect(trigger).toHaveTextContent("选择本地 SKU");
    expect(rankSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("target-sku-search-item-1"), {
      target: { value: "WHITE" },
    });
    fireEvent.click(trigger);
    const manualOption = await screen.findByRole("option", {
      name: "X8-WHITE",
    });
    expect(manualOption).not.toHaveTextContent(/%/);
    fireEvent.click(manualOption);
    expect(trigger).toHaveTextContent("X8-WHITE");
  });

  it("supports keyboard selection and keeps the portal menu mounted through its 160ms exit", async () => {
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox.parentElement).toBe(document.body);
    await waitFor(() => expect(listbox).toHaveAttribute("data-state", "open"));
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("target-sku-option-item-1"),
    );
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1].id,
    );
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveTextContent("X8-WHITE");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "data-state",
      "exiting",
    );
    await waitFor(
      () => expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      { timeout: 500 },
    );

    fireEvent.click(trigger);
    await screen.findByRole("listbox");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "data-state",
      "exiting",
    );
    await waitFor(
      () => expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      { timeout: 500 },
    );
  });

  it("scrolls the active portal option into view when keyboard navigation moves it", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toHaveAttribute("data-state", "open"),
    );
    scrollIntoView.mockClear();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }),
    );
    expect(scrollIntoView.mock.instances.at(-1)).toBe(
      screen.getAllByRole("option")[1],
    );
  });

  it("positions the portal above near the viewport edge, repositions it, and closes on outside click", async () => {
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    const nearBottom = {
      x: 40,
      y: 700,
      top: 700,
      right: 300,
      bottom: 740,
      left: 40,
      width: 260,
      height: 40,
      toJSON: () => ({}),
    };
    const nearTop = { ...nearBottom, y: 100, top: 100, bottom: 140 };
    const rect = vi
      .fn()
      .mockReturnValueOnce(nearBottom)
      .mockReturnValueOnce(nearBottom)
      .mockReturnValue(nearTop);
    trigger.getBoundingClientRect = rect;

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox).toHaveAttribute("data-placement", "top");

    fireEvent.resize(window);
    await waitFor(() =>
      expect(listbox).toHaveAttribute("data-placement", "bottom"),
    );
    fireEvent.mouseDown(document.body);
    expect(listbox).toHaveAttribute("data-state", "exiting");
    await waitFor(
      () => expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      { timeout: 500 },
    );
  });

  it("unmounts the candidate menu immediately when reduced motion is requested", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    });
    try {
      render(<RestockV2 />);
      const trigger = await screen.findByTestId("target-sku-select-item-1");
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      fireEvent.keyDown(trigger, { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("keeps showing and saving the selected SKU when search filters it out of candidates", async () => {
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    expect(trigger).toHaveTextContent("X8-BLACK");

    fireEvent.change(screen.getByTestId("target-sku-search-item-1"), {
      target: { value: "WHITE" },
    });
    expect(trigger).toHaveTextContent("X8-BLACK");
    expect(trigger).not.toHaveTextContent("选择本地 SKU");

    fireEvent.click(screen.getByRole("button", { name: "保存映射" }));
    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/import-1/items/item-1/mapping",
        { targetSku: "X8-BLACK" },
      ),
    );
  });

  it("confirms before clearing an unsaved selection on site switch", async () => {
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /马来西亚/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("未保存");
    fireEvent.click(screen.getByRole("button", { name: "继续切换" }));
    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/latest",
        { params: { site: "MY" } },
      ),
    );
  });

  it("paginates large mapping queues by 50 rows and resets the page when filtering", async () => {
    const rankSpy = vi.spyOn(targetSkuUtils, "rankRestockTargetSkus");
    const items = Array.from({ length: 120 }, (_, index) => ({
      ...pendingImport.items[0],
      id: `item-${index + 1}`,
      platformSku: `X8_BLACK_${String(index + 1).padStart(3, "0")}`,
      sourceSku: `X8_BLACK_${String(index + 1).padStart(3, "0")}`,
    }));
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [
              {
                code: "PH",
                label: "菲律宾",
                productCount: 1,
                warehouseCodes: ["PH-1"],
              },
            ],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({
          data: { ...pendingImport, items, pending: items },
        });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<RestockV2 />);

    expect(await screen.findByText("X8_BLACK_001")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^target-sku-select-item-/)).toHaveLength(50);
    const initialRankCalls = rankSpy.mock.calls.length;
    expect(initialRankCalls).toBeLessThanOrEqual(100);
    fireEvent.change(screen.getByTestId("target-sku-search-item-1"), {
      target: { value: "WHITE" },
    });
    expect(rankSpy).toHaveBeenCalledTimes(initialRankCalls);
    expect(screen.queryByText("X8_BLACK_051")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "映射队列分页" }),
    ).toHaveTextContent("第 1 / 3 页");

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("X8_BLACK_051")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "映射队列分页" }),
    ).toHaveTextContent("第 2 / 3 页");

    fireEvent.change(screen.getByLabelText("搜索映射 SKU"), {
      target: { value: "001" },
    });
    expect(await screen.findByText("X8_BLACK_001")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "映射队列分页" }),
    ).toHaveTextContent("第 1 / 1 页");
  });

  it("ignores late sales-import and rule responses from the previous site", async () => {
    const phImport = deferred<{ data: typeof pendingImport }>();
    const phRules = deferred<{ data: { rules: unknown[] } }>();
    const myImport = {
      ...pendingImport,
      import: {
        ...pendingImport.import,
        id: "import-my",
        site: "MY",
        fileName: "my-orders.xlsx",
      },
    };
    mockedGet.mockImplementation(
      (url: string, config?: { params?: { site?: string } }) => {
        if (url === "/restock-v2/sites")
          return Promise.resolve({
            data: {
              ycConfigured: true,
              sites: [
                {
                  code: "PH",
                  label: "菲律宾",
                  productCount: 1,
                  warehouseCodes: ["PH-1"],
                },
                {
                  code: "MY",
                  label: "马来西亚",
                  productCount: 1,
                  warehouseCodes: ["MY-1"],
                },
              ],
            },
          });
        if (
          url === "/restock-v2/sales-imports/latest" &&
          config?.params?.site === "PH"
        )
          return phImport.promise;
        if (url === "/restock-v2/sku-rules" && config?.params?.site === "PH")
          return phRules.promise;
        if (
          url === "/restock-v2/sales-imports/latest" &&
          config?.params?.site === "MY"
        )
          return Promise.resolve({ data: myImport });
        if (url === "/restock-v2/sku-rules" && config?.params?.site === "MY")
          return Promise.resolve({ data: { rules: [] } });
        return Promise.reject(new Error(`unexpected ${url}`));
      },
    );

    render(<RestockV2 />);
    const myButton = await screen.findByRole("button", { name: /马来西亚/ });
    fireEvent.click(myButton);
    expect(await screen.findByText("my-orders.xlsx")).toBeInTheDocument();

    await act(async () => {
      phImport.resolve({ data: pendingImport });
      phRules.resolve({ data: { rules: [{ sku: "PH-ONLY" }] } });
    });
    expect(screen.getByText("my-orders.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("orders.xlsx")).not.toBeInTheDocument();
  });

  it("traps focus in the site dialog, closes on Escape, and restores the initiating site button", async () => {
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const myButton = screen.getByRole("button", { name: /马来西亚/ });
    fireEvent.click(myButton);

    const dialog = screen.getByRole("dialog", { name: "存在未保存的映射内容" });
    const stayButton = screen.getByRole("button", { name: "留在当前站点" });
    expect(stayButton).toHaveFocus();
    const closeButton = screen.getByRole("button", {
      name: "关闭切换站点确认",
    });
    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "继续切换" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(myButton).toHaveFocus();
  });

  it("disables site switching while a mapping mutation is active", async () => {
    const cancellation = deferred<{ data: { dismissedAt: string } }>();
    mockedPatch.mockReturnValueOnce(cancellation.promise);
    render(<RestockV2 />);
    await screen.findByTestId("target-sku-select-item-1");
    fireEvent.click(screen.getByRole("button", { name: "取消映射" }));

    expect(screen.getByRole("button", { name: /马来西亚/ })).toBeDisabled();
    await act(async () =>
      cancellation.resolve({
        data: { dismissedAt: "2026-07-10T00:00:00.000Z" },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /马来西亚/ }),
      ).not.toBeDisabled(),
    );
  });

  it("uses a synchronous global lock to block duplicate creates and every other write action", async () => {
    const creation = deferred<{
      data: { id: string; sku: string; name: string };
    }>();
    mockedPost.mockReturnValueOnce(creation.promise);
    render(<RestockV2 />);
    await screen.findByTestId("target-sku-create-toggle-item-1");
    fireEvent.click(screen.getByTestId("target-sku-create-toggle-item-1"));
    fireEvent.change(screen.getByTestId("target-sku-create-code-item-1"), {
      target: { value: "NEW-SKU" },
    });
    const submit = screen.getByTestId("target-sku-create-submit-item-1");

    await act(async () => {
      submit.click();
      submit.click();
    });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /马来西亚/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存映射" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消映射" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "开始计算补货建议" }),
    ).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("创建中");

    await act(async () =>
      creation.resolve({
        data: { id: "new", sku: "NEW-SKU", name: "NEW-SKU" },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /马来西亚/ }),
      ).not.toBeDisabled(),
    );
  });

  it("keeps the row normal while cancellation is pending, then animates it out after success", async () => {
    const cancellation = deferred<{ data: { dismissedAt: string } }>();
    mockedPatch.mockReturnValueOnce(cancellation.promise);
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    const row = trigger.closest("tr");
    fireEvent.click(screen.getByRole("button", { name: "取消映射" }));

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/import-1/items/item-1/dismissal",
        { dismissed: true },
      ),
    );
    expect(row).toHaveAttribute("data-dismiss-state", "pending");
    expect(row).toHaveClass("opacity-100");

    await act(async () =>
      cancellation.resolve({
        data: { dismissedAt: "2026-07-10T00:00:00.000Z" },
      }),
    );
    expect(row).toHaveAttribute("data-dismiss-state", "exiting");
    expect(row).toHaveClass("opacity-0");
    expect(screen.getByTestId("target-sku-select-item-1")).toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          screen.queryByTestId("target-sku-select-item-1"),
        ).not.toBeInTheDocument(),
      { timeout: 500 },
    );
  });

  it("clears a pending row-collapse timer when the site changes", async () => {
    const cancellation = deferred<{ data: { dismissedAt: string } }>();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    mockedPatch.mockReturnValueOnce(cancellation.promise);
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    fireEvent.click(screen.getByRole("button", { name: "取消映射" }));
    await act(async () =>
      cancellation.resolve({
        data: { dismissedAt: "2026-07-10T00:00:00.000Z" },
      }),
    );
    expect(trigger.closest("tr")).toHaveAttribute(
      "data-dismiss-state",
      "exiting",
    );
    clearTimeoutSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /马来西亚/ }));

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/latest",
        { params: { site: "MY" } },
      ),
    );
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("keeps the row and selected SKU intact when cancellation fails", async () => {
    const cancellation = deferred<{ data: { dismissedAt: string } }>();
    mockedPatch.mockReturnValueOnce(cancellation.promise);
    render(<RestockV2 />);
    const trigger = await screen.findByTestId("target-sku-select-item-1");
    expect(trigger).toHaveTextContent("X8-BLACK");

    fireEvent.click(screen.getByRole("button", { name: "取消映射" }));
    await act(async () => cancellation.reject(new Error("network failed")));

    expect(screen.getByTestId("target-sku-select-item-1")).toHaveTextContent(
      "X8-BLACK",
    );
    expect(trigger.closest("tr")).toHaveAttribute("data-dismiss-state", "idle");
    expect(await screen.findByText("取消映射失败。")).toBeInTheDocument();
  });

  it("collapses and expands the SKU mapping review section", async () => {
    render(<RestockV2 />);
    await screen.findByTestId("target-sku-select-item-1");

    const collapse = screen.getByRole("button", { name: "折叠 SKU 映射审核" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(screen.queryByLabelText("搜索映射 SKU")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "展开 SKU 映射审核" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByLabelText("搜索映射 SKU")).toBeInTheDocument();
  });

  it("collapses and expands SKU-specific overrides", async () => {
    const mappedImport = {
      ...pendingImport,
      items: [{ ...pendingImport.items[0], targetSku: "X8-BLACK" }],
      pending: [],
    };
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
            ycConfigured: true,
            sites: [{ code: "PH", label: "菲律宾", productCount: 1, warehouseCodes: ["PH-1"] }],
          },
        });
      if (url === "/restock-v2/sales-imports/latest")
        return Promise.resolve({ data: mappedImport });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.resolve({ data: mappedImport });
    });

    render(<RestockV2 />);
    await screen.findByLabelText("X8-BLACK 补货时效");
    const collapse = screen.getByRole("button", { name: "折叠 SKU 单独覆盖" });
    fireEvent.click(collapse);
    expect(screen.queryByLabelText("X8-BLACK 补货时效")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开 SKU 单独覆盖" }));
    expect(screen.getByLabelText("X8-BLACK 补货时效")).toBeInTheDocument();
  });
});
