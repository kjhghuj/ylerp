import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {CollectionModal} from '../modules/product-analysis/components/CollectionModal';
import type {ShopMeta} from '../modules/product-analysis/types';
import * as api from '../modules/product-analysis/services/collectionApi';

vi.mock('../modules/product-analysis/services/collectionApi',()=>({
  fetchBinding:vi.fn(),listCollectionRuns:vi.fn(),createSource:vi.fn(),bindCollectorShop:vi.fn(),
  submitManualCookies:vi.fn(),createCollectionRun:vi.fn(),fetchCollectionRun:vi.fn(),
  actOnCollectionRun:vi.fn(),retryCollectionUpload:vi.fn(),downloadCollectionReport:vi.fn(),
}));

const shopA={id:'shop-a',name:'PH 店铺 A',site:'PH',currency:'PHP'} as ShopMeta;
const shopB={id:'shop-b',name:'PH 店铺 B',site:'PH',currency:'PHP'} as ShopMeta;
const cookies=[{name:'SPC_EC',value:'test-session',domain:'.shopee.ph',path:'/',secure:true,httpOnly:true}];
const storageKey=(id:string)=>`product-analysis:collector-shop-id:${id}`;
let states:Record<string,api.BindingState>;
const empty=():api.BindingState=>({binding:null,sources:[],connection:null});
const onClose=vi.fn(),onImported=vi.fn();
function view(shop=shopA){return <CollectionModal shop={shop} onClose={onClose} onImported={onImported}/>;}
async function ready(){await waitFor(()=>expect(screen.queryByText('正在读取店铺配置…')).toBeNull());}
function fill(id='12345678',json=JSON.stringify(cookies),spc=' test-cds '){
  if(!(screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).readOnly)
    fireEvent.change(screen.getByLabelText('Shopee 店铺 ID'),{target:{value:id}});
  fireEvent.change(screen.getByLabelText('Cookie-Editor JSON'),{target:{value:json}});
  fireEvent.change(screen.getByLabelText('SPC_CDS'),{target:{value:spc}});
}
const waitForAutoSave=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,900));});

beforeEach(()=>{
  vi.resetAllMocks();localStorage.clear();states={'shop-a':empty(),'shop-b':empty()};
  vi.mocked(api.fetchBinding).mockImplementation(async id=>states[id]);
  vi.mocked(api.listCollectionRuns).mockResolvedValue([]);
  vi.mocked(api.createSource).mockResolvedValue({sourceId:'manual-source',connectionId:'connection-a',pairingCode:'unused',expiresInSeconds:600});
  vi.mocked(api.bindCollectorShop).mockImplementation(async(id,sourceId,shopeeShopId)=>{
    states[id]={...states[id],binding:{site:'PH',sourceId,shopeeShopId,connectionId:'connection-a',sourceName:'手动 Cookie'}};
  });
  vi.mocked(api.submitManualCookies).mockImplementation(async id=>{
    states[id]={...states[id],connection:{paired:false,lastSync:null,detail:null,
      credential:{status:'pending',last_validated_at:null,last_error:null}}};
  });
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

describe('manual collection credentials',()=>{
  it('downloads an original report from the selected ERP shop and collection run',async()=>{
    const run={id:'run-a',shopId:shopA.id,fromDate:'2026-09-28',toDate:'2026-09-28',recollectExisting:false,status:'COMPLETED',collectorBatchId:1,createdAt:''};
    vi.mocked(api.listCollectionRuns).mockResolvedValue([run]);
    vi.mocked(api.fetchCollectionRun).mockResolvedValue({run,batch:{counts:{IMPORTED:1},total:1},
      tasks:[{id:42,report_date:'2026-09-28',status:'IMPORTED',hasFile:true}],page:1,pages:1});
    vi.mocked(api.downloadCollectionReport).mockResolvedValue();
    render(view());await ready();
    fireEvent.click(await screen.findByRole('button',{name:'下载原始报表'}));
    await waitFor(()=>expect(api.downloadCollectionReport).toHaveBeenCalledWith(shopA.id,'run-a',42,'2026-09-28'));
  });

  it('creates and binds a source from an empty account, saves separate credentials, then starts collection',async()=>{
    const run={id:'run-a',shopId:shopA.id,fromDate:'2026-09-01',toDate:'2026-09-07',recollectExisting:false,status:'ACTIVE',collectorBatchId:1,createdAt:''};
    vi.mocked(api.createCollectionRun).mockResolvedValue(run);
    vi.mocked(api.fetchCollectionRun).mockResolvedValue({run,batch:null,tasks:[],page:1,pages:1});
    render(view());await ready();
    expect(screen.queryByLabelText('Cookie 来源')).toBeNull();
    expect((screen.getByRole('button',{name:'开始采集'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button',{name:'保存采集凭据'})).toBeNull();
    fill();await waitForAutoSave();
    await screen.findByText(/采集凭据已自动保存/);
    expect(api.createSource).toHaveBeenCalledWith(shopA.id,'PH 店铺 A 手动 Cookie');
    expect(api.bindCollectorShop).toHaveBeenCalledWith(shopA.id,'manual-source','12345678');
    expect(api.submitManualCookies).toHaveBeenCalledWith(shopA.id,'manual-source',cookies,'test-cds');
    expect((screen.getByLabelText('Cookie-Editor JSON') as HTMLTextAreaElement).value).toBe(JSON.stringify(cookies));
    expect((screen.getByLabelText('SPC_CDS') as HTMLInputElement).value).toBe(' test-cds ');
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(storageKey(shopA.id))).toBe('12345678');
    await waitFor(()=>expect((screen.getByRole('button',{name:'开始采集'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'开始采集'}));
    await waitFor(()=>expect(api.createCollectionRun).toHaveBeenCalledWith(shopA.id,expect.any(String),expect.any(String),false,expect.any(String)));
  });

  it.each(['{"secret":','{}','[]','[null]','[{"name":"x","value":1}]'])('rejects malformed Cookie-Editor input before creating a source: %s',async json=>{
    render(view());await ready();fill('12345678',json);await waitForAutoSave();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api.createSource).not.toHaveBeenCalled();expect(api.submitManualCookies).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).not.toContain('secret');
  });

  it('requires a separate SPC_CDS value and validates the shop ID',async()=>{
    render(view());await ready();fill('invalid',JSON.stringify(cookies),'   ');
    await waitForAutoSave();
    expect(api.submitManualCookies).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByLabelText('SPC_CDS'),{target:{value:'cds'}});await waitForAutoSave();
    expect((await screen.findByRole('alert')).textContent).toContain('店铺 ID');
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('remembers IDs per shop across switching and reopening, without carrying credentials over',async()=>{
    const rendered=render(view());await ready();fill('11111111');
    rendered.rerender(view(shopB));await ready();
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Cookie-Editor JSON') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('SPC_CDS') as HTMLInputElement).value).toBe('');
    fill('22222222');rendered.rerender(view(shopA));await ready();
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).value).toBe('11111111');
    rendered.unmount();render(view(shopB));await ready();
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).value).toBe('22222222');
    expect(localStorage.length).toBe(2);
    await waitForAutoSave();
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('restores the server binding over a local draft and reuses its source',async()=>{
    localStorage.setItem(storageKey(shopA.id),'99999999');
    states[shopA.id].binding={site:'PH',shopeeShopId:'87654321',sourceId:'existing',connectionId:'connection-old',sourceName:'已有连接'};
    render(view());await ready();
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).value).toBe('87654321');
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).readOnly).toBe(true);
    fill();await waitForAutoSave();await screen.findByText(/采集凭据已自动保存/);
    expect(api.createSource).not.toHaveBeenCalled();expect(api.bindCollectorShop).not.toHaveBeenCalled();
    expect(api.submitManualCookies).toHaveBeenCalledWith(shopA.id,'existing',cookies,'test-cds');
  });

  it('does not automatically use another shop’s existing cookie source',async()=>{
    states[shopA.id].sources=[{id:'other-shop-source',name:'其他店铺',connectionId:'other',createdAt:''}];
    render(view());await ready();fill();await waitForAutoSave();await screen.findByText(/采集凭据已自动保存/);
    expect(api.createSource).toHaveBeenCalledTimes(1);
    expect(api.submitManualCookies).toHaveBeenCalledWith(shopA.id,'manual-source',cookies,'test-cds');
  });

  it('retains input after a failed submission and retries the successful binding without duplicating sources',async()=>{
    vi.mocked(api.submitManualCookies).mockRejectedValueOnce(new Error('采集服务暂时不可用'));
    render(view());await ready();fill();await waitForAutoSave();
    await screen.findByText('采集服务暂时不可用');
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText('Cookie-Editor JSON') as HTMLTextAreaElement).value).toBe(JSON.stringify(cookies));
    await waitForAutoSave();expect(api.submitManualCookies).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'重试'}));
    await waitForAutoSave();await screen.findByText(/采集凭据已自动保存/);
    expect(api.createSource).toHaveBeenCalledTimes(1);expect(api.bindCollectorShop).toHaveBeenCalledTimes(1);
    expect(api.submitManualCookies).toHaveBeenCalledTimes(2);
  });

  it('ignores a previous shop’s late binding response',async()=>{
    let resolve!:(value:api.BindingState)=>void;
    vi.mocked(api.fetchBinding).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    const rendered=render(view());rendered.rerender(view(shopB));await ready();fill('22222222');
    await act(async()=>resolve({...empty(),binding:{site:'PH',shopeeShopId:'11111111',sourceId:'old',connectionId:'old',sourceName:'old'}}));
    expect((screen.getByLabelText('Shopee 店铺 ID') as HTMLInputElement).value).toBe('22222222');
    await waitForAutoSave();await screen.findByText(/采集凭据已自动保存/);
    expect(api.bindCollectorShop).toHaveBeenCalledWith(shopB.id,'manual-source','22222222');
  });

  it('debounces edits, does not repeat saved requests, and saves the latest SPC_CDS before collection',async()=>{
    render(view());await ready();vi.useFakeTimers();
    fill();await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
    fireEvent.change(screen.getByLabelText('SPC_CDS'),{target:{value:'latest-cds'}});
    await act(async()=>{await vi.advanceTimersByTimeAsync(799);});
    expect(api.submitManualCookies).not.toHaveBeenCalled();
    await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
    expect(api.submitManualCookies).toHaveBeenCalledWith(shopA.id,'manual-source',cookies,'latest-cds');
    await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
    expect(api.submitManualCookies).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('SPC_CDS'),{target:{value:'updated-cds'}});
    expect((screen.getByRole('button',{name:'开始采集'}) as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>{await vi.advanceTimersByTimeAsync(800);});
    expect(api.submitManualCookies).toHaveBeenLastCalledWith(shopA.id,'manual-source',cookies,'updated-cds');
    expect(api.submitManualCookies).toHaveBeenCalledTimes(2);
    expect((screen.getByRole('button',{name:'开始采集'}) as HTMLButtonElement).disabled).toBe(false);
  });
});
