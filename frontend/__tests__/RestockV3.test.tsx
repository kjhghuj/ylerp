import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockV3 } from "../modules/RestockV3";
import api from "../src/api";

vi.mock("../src/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockedPut = api.put as unknown as ReturnType<typeof vi.fn>;

const SHOPS = [
  {
    id: "shop-1",
    name: "马来3C店",
    site: "MY",
    platform: "shopee",
    currency: "MYR",
    dayCount: 9,
    latestUploadDate: "2026-09-06",
  },
];

/** 两行销量：SKU-A 已有映射（LOCAL-A），SKU-B 待映射 */
const salesResponse = (overrides: Record<string, unknown> = {}) => ({
  data: {
    shop: { id: "shop-1", name: "马来3C店", site: "MY", currency: "MYR" },
    from: "2026-09-01",
    to: "2026-09-06",
    shopObservedDays: 5,
    pendingCount: 1,
    noSkuVariationCount: 0,
    noSkuVariationUnits: 0,
    rows: [
      {
        externalSku: "SKU-A",
        displaySku: "SKU-A",
        level: "variation",
        itemId: "1001",
        itemName: "键盘",
        variationName: "黑色",
        units: 7,
        observedDays: 2,
        targetSku: "LOCAL-A",
        mappingStatus: "mapped",
      },
      {
        externalSku: "SKU-B",
        displaySku: "SKU-B",
        level: "variation",
        itemId: "1001",
        itemName: "键盘",
        variationName: "白色",
        units: 2,
        observedDays: 1,
        targetSku: null,
        mappingStatus: "pending",
      },
    ],
    ...overrides,
  },
});

const TARGET_SKUS = {
  data: {
    items: [
      { id: "t1", sku: "LOCAL-A", name: "A 本地" },
      { id: "t2", sku: "LOCAL-B", name: "B 本地" },
    ],
  },
};

const PLAN_RESPONSE = {
  data: {
    generatedAt: "2026-09-09T00:00:00.000Z",
    summary: { totalSuggestedQty: 333, restockCount: 1 },
    items: [
      {
        productId: "prod-1",
        name: "A 商品",
        sku: "LOCAL-A",
        site: "MY",
        status: "warning",
        reason: "",
        dailySales: 3.5,
        availableStock: 10,
        arrivalDate: "2026-10-04",
        coverageDays: 65,
        inTransitBeforeArrival: 0,
        inTransitDuringCoverage: 0,
        suggestedQty: 333,
        warnings: [],
      },
    ],
    metadata: {
      statisticsDays: 5,
      observedDays: 5,
      statisticsDaysOverridden: false,
      pendingCount: 1,
      excludedMissingInventoryCount: 0,
      excludedOversizedSkus: [],
      noSkuVariationCount: 0,
    },
    integration: {
      ycConfigured: true,
      remoteFetched: true,
      stockSource: "yc",
      warehouseCodes: ["WH-MY"],
      warnings: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockImplementation((url: string) => {
    if (url === "/restock-v3/shops") return Promise.resolve({ data: SHOPS });
    if (url === "/restock-v3/shops/shop-1/sales")
      return Promise.resolve(salesResponse());
    if (url === "/restock-v3/target-skus") return Promise.resolve(TARGET_SKUS);
    if (url === "/restock-v3/sku-rules")
      return Promise.resolve({ data: { site: "MY", rules: [] } });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  mockedPut.mockResolvedValue({ data: {} });
  mockedPost.mockResolvedValue({ data: {} });
});

async function selectShop() {
  render(<RestockV3 />);
  const select = await screen.findByLabelText("选择商品分析店铺");
  await act(async () => {
    fireEvent.change(select, { target: { value: "shop-1" } });
  });
  // 店铺选择后默认区间 latest-29 ~ latest
  await waitFor(() =>
    expect(mockedGet).toHaveBeenCalledWith("/restock-v3/shops/shop-1/sales", {
      params: { from: "2026-08-08", to: "2026-09-06" },
    }),
  );
}

describe("RestockV3 shop-based restock workflow", () => {
  it("loads shops and shows an empty-state hint when no shops exist", async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v3/shops") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<RestockV3 />);
    await waitFor(() =>
      expect(
        screen.getByText(/还没有商品分析店铺；请先在「商品分析」模块创建店铺/),
      ).toBeInTheDocument(),
    );
  });

  it("selects the default range from the latest upload date and aggregates sales rows", async () => {
    await selectShop();
    expect(await screen.findByText("SKU-B")).toBeInTheDocument();
    // 待映射 1 · 已映射 1
    expect(screen.getByText(/待映射 1/)).toBeInTheDocument();
    // 店铺统计条：区间内实际上传天数（统计条 + 参数提示两处出现）
    expect(screen.getAllByText(/区间内实际上传/).length).toBeGreaterThan(0);
  });

  it("maps a pending SKU with the candidate picker and saves it", async () => {
    await selectShop();
    const trigger = await screen.findByTestId("target-sku-select-SKU-B");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const option = await screen.findByRole("option", { name: /LOCAL-B/ });
    await act(async () => {
      fireEvent.click(option);
    });
    const saveButton = await screen.findByText("保存映射");
    await act(async () => {
      fireEvent.click(saveButton);
    });
    await waitFor(() =>
      expect(mockedPut).toHaveBeenCalledWith("/restock-v3/mapping", {
        shopId: "shop-1",
        externalSku: "SKU-B",
        targetSku: "LOCAL-B",
      }),
    );
  });

  it("shows a friendly message when the range has no uploads", async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === "/restock-v3/shops") return Promise.resolve({ data: SHOPS });
      if (url === "/restock-v3/shops/shop-1/sales")
        return Promise.reject({
          response: {
            status: 400,
            data: { error: "No product analysis uploads in this date range" },
          },
        });
      if (url === "/restock-v3/target-skus") return Promise.resolve(TARGET_SKUS);
      if (url === "/restock-v3/sku-rules")
        return Promise.resolve({ data: { rules: [] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    await selectShop();
    await waitFor(() =>
      expect(
        screen.getByText(/所选区间内没有商品分析上传数据/),
      ).toBeInTheDocument(),
    );
  });

  it("computes recommendations with auto statistics days and renders the plan", async () => {
    await selectShop();
    // SKU-B 待映射时仍可直接计算（后端会跳过 pending）
    const calculate = await screen.findByText("开始计算补货建议");
    mockedPost.mockResolvedValueOnce(PLAN_RESPONSE);
    await act(async () => {
      fireEvent.click(calculate);
    });
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        "/restock-v3/recommendations",
        expect.objectContaining({
          shopId: "shop-1",
          from: "2026-08-08",
          to: "2026-09-06",
          leadTimeDays: 25,
          safetyDays: 30,
        }),
      ),
    );
    expect(await screen.findByText("LOCAL-A")).toBeInTheDocument();
    // 建议总量与明细单元格各出现一次
    expect(screen.getAllByText("333").length).toBe(2);
    // 自动统计口径来自区间实际上传天数，不额外传 statisticsDays
    expect(mockedPost.mock.calls[0][1]).not.toHaveProperty("statisticsDays");
    expect(screen.getByText(/统计口径：5 天（区间实际上传天数）/)).toBeInTheDocument();
    expect(screen.getByText(/1 个 SKU 待映射未参与/)).toBeInTheDocument();
  });

  it("passes a custom statisticsDays when the user overrides it", async () => {
    await selectShop();
    await screen.findByText("SKU-B");
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const customRadio = radios.find((radio) =>
      radio.closest("label")?.textContent?.includes("自定义"),
    )!;
    expect(customRadio).toBeTruthy();
    await act(async () => {
      fireEvent.click(customRadio);
    });
    const input = await screen.findByLabelText("自定义统计天数");
    await act(async () => {
      fireEvent.change(input, { target: { value: "7" } });
    });
    const calculate = screen.getByText("开始计算补货建议");
    mockedPost.mockResolvedValueOnce(PLAN_RESPONSE);
    await act(async () => {
      fireEvent.click(calculate);
    });
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        "/restock-v3/recommendations",
        expect.objectContaining({ statisticsDays: 7 }),
      ),
    );
  });
});
