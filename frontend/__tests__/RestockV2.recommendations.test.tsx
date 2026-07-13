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
import { parseRestockSalesFile } from "../modules/restock/utils/restockSalesImportParser";

vi.mock("../src/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));
vi.mock("../StoreContext", () => ({
  useStore: () => ({
    inventory: [
      { id: "inventory-1", sku: "LOCAL-1", name: "本地商品" },
      { id: "inventory-2", sku: "FPG-WIHTE", name: "相似 SKU" },
    ],
    products: [
      { id: "product-only", sku: "PRODUCT-ONLY", name: "未入元仓商品" },
    ],
  }),
}));
vi.mock("../modules/restock/utils/restockSalesImportParser", async () => {
  const actual = await vi.importActual<
    typeof import("../modules/restock/utils/restockSalesImportParser")
  >("../modules/restock/utils/restockSalesImportParser");
  return { ...actual, parseRestockSalesFile: vi.fn() };
});

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockedPut = api.put as unknown as ReturnType<typeof vi.fn>;
const mockedParseFile = parseRestockSalesFile as unknown as ReturnType<
  typeof vi.fn
>;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const importedSales = {
  import: {
    id: "import-1",
    site: "PH",
    fileName: "orders.xlsx",
    statisticsDays: 30,
    createdAt: "2026-07-10T00:00:00.000Z",
  },
  items: [
    {
      id: "item-pending",
      platformSku: "FPG_WIHTF",
      sourceSku: "FPG_wihtf",
      validSales: 189,
      title: "映射商品",
      spec: "白色",
      targetSku: null,
    },
  ],
  pending: [
    {
      id: "item-pending",
      platformSku: "FPG_WIHTF",
      sourceSku: "FPG_wihtf",
      validSales: 189,
      title: "映射商品",
      spec: "白色",
      targetSku: null,
    },
  ],
};
const recommendation = {
  summary: { totalSuggestedQty: 62, restockCount: 1 },
  items: [
    {
      productId: "product-1",
      name: "本地商品",
      sku: "LOCAL-1",
      dailySales: 6.3,
      availableStock: 10,
      arrivalDate: "2026-07-26",
      coverageDays: 67,
      inTransitBeforeArrival: 2,
      inTransitDuringCoverage: 5,
      safetyStockDemand: 189,
      suggestedQty: 62,
      warnings: ["ETA 缺失"],
    },
  ],
};

describe("RestockV2 sales-import planning flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedParseFile.mockResolvedValue({
      rows: [
        {
          platformSku: "FPG_WIHTF",
          sourceSku: "FPG_wihtf",
          validSales: 189,
          title: "映射商品",
          spec: "白色",
        },
      ],
      sourceRowCount: 1,
      pendingCount: 0,
    });
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
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
        return Promise.reject({ response: { status: 404 } });
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      if (url === "/restock-v2/sales-imports/import-1")
        return Promise.resolve({ data: importedSales });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedPost.mockImplementation((url: string) => {
      if (url === "/restock-v2/sales-imports")
        return Promise.resolve({ data: importedSales });
      if (url === "/restock-v2/recommendations")
        return Promise.resolve({ data: recommendation });
      if (url === "/restock-v2/target-skus")
        return Promise.resolve({
          data: { id: "new", sku: "NEW-LOCAL", name: "新建 SKU" },
        });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedPut.mockResolvedValue({
      data: {
        sku: "LOCAL-1",
        leadTimeDays: null,
        safetyDays: null,
        growthPercent: null,
      },
    });
  });

  it("uploads explicit valid-sales data and submits the date-based replenishment inputs", async () => {
    render(<RestockV2 />);
    await screen.findByText("菲律宾");
    fireEvent.change(screen.getByLabelText("销售 Excel 文件"), {
      target: { files: [new File(["xlsx"], "orders.xlsx")] },
    });
    await screen.findByText(/已解析 1 行/);
    fireEvent.click(screen.getByRole("button", { name: "确认上传" }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        "/restock-v2/sales-imports",
        expect.objectContaining({
          site: "PH",
          fileName: "orders.xlsx",
          statisticsDays: 30,
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText("计划日期"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("目标到货覆盖日"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始计算补货建议" }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        "/restock-v2/recommendations",
        expect.objectContaining({
          site: "PH",
          salesImportId: "import-1",
          planningDate: "2026-07-01",
          targetDate: "2026-10-01",
          leadTimeDays: 25,
          safetyDays: 30,
          growthPercent: 0,
        }),
      ),
    );
    expect((await screen.findAllByText("62")).length).toBeGreaterThan(0);
  });

  it("creates a local SKU, requires a separate mapping save, then saves an SKU override rule", async () => {
    render(<RestockV2 />);
    await screen.findByText("菲律宾");
    fireEvent.change(screen.getByLabelText("销售 Excel 文件"), {
      target: { files: [new File(["xlsx"], "orders.xlsx")] },
    });
    await screen.findByText(/已解析 1 行/);
    fireEvent.click(screen.getByRole("button", { name: "确认上传" }));
    await screen.findByTestId("target-sku-create-toggle-item-pending");
    fireEvent.click(
      screen.getByTestId("target-sku-create-toggle-item-pending"),
    );
    fireEvent.change(
      screen.getByTestId("target-sku-create-code-item-pending"),
      { target: { value: "NEW-LOCAL" } },
    );
    fireEvent.click(
      screen.getByTestId("target-sku-create-submit-item-pending"),
    );
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith("/restock-v2/target-skus", {
        site: "PH",
        sku: "NEW-LOCAL",
        name: "NEW-LOCAL",
      }),
    );
    expect(mockedPut).not.toHaveBeenCalledWith(
      "/restock-v2/sales-imports/import-1/items/item-pending/mapping",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存映射" }));
    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith(
        "/restock-v2/sales-imports/import-1/items/item-pending/mapping",
        { targetSku: "NEW-LOCAL" },
      ),
    );
  });

  it("keeps the newest selected file preview when an older parser resolves late", async () => {
    const firstParse = deferred<{
      rows: never[];
      sourceRowCount: number;
      pendingCount: number;
    }>();
    const secondParse = deferred<{
      rows: never[];
      sourceRowCount: number;
      pendingCount: number;
    }>();
    mockedParseFile
      .mockReturnValueOnce(firstParse.promise)
      .mockReturnValueOnce(secondParse.promise);
    render(<RestockV2 />);
    await screen.findByText("菲律宾");
    const input = screen.getByLabelText("销售 Excel 文件");

    fireEvent.change(input, { target: { files: [new File(["a"], "a.xlsx")] } });
    fireEvent.change(input, { target: { files: [new File(["b"], "b.xlsx")] } });
    await act(async () =>
      secondParse.resolve({ rows: [], sourceRowCount: 2, pendingCount: 0 }),
    );
    expect(await screen.findByText(/已解析 2 行/)).toBeInTheDocument();
    await act(async () =>
      firstParse.resolve({ rows: [], sourceRowCount: 1, pendingCount: 0 }),
    );
    expect(screen.getByText(/已解析 2 行/)).toBeInTheDocument();
    expect(screen.queryByText(/已解析 1 行/)).not.toBeInTheDocument();
  });

  it("does not let the initial same-site latest request overwrite a successful upload", async () => {
    const initialLatest = deferred<{ data: typeof importedSales }>();
    const olderImport = {
      ...importedSales,
      import: {
        ...importedSales.import,
        id: "old-import",
        fileName: "old.xlsx",
      },
    };
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v2/sites")
        return Promise.resolve({
          data: {
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
        return initialLatest.promise;
      if (url === "/restock-v2/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<RestockV2 />);
    await screen.findByText("菲律宾");
    fireEvent.change(screen.getByLabelText("销售 Excel 文件"), {
      target: { files: [new File(["xlsx"], "new.xlsx")] },
    });
    await screen.findByText(/已解析 1 行/);
    fireEvent.click(screen.getByRole("button", { name: "确认上传" }));
    expect(await screen.findByText("orders.xlsx")).toBeInTheDocument();

    await act(async () => initialLatest.resolve({ data: olderImport }));
    expect(screen.getByText("orders.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("old.xlsx")).not.toBeInTheDocument();
  });
});
