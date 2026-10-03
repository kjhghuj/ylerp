import React from 'react';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CollectorSyncSummary} from '../modules/product-analysis/components/CollectorSyncSummary';
import {useCollectorSyncStatus} from '../modules/product-analysis/hooks/useCollectorSyncStatus';
import * as api from '../modules/product-analysis/services/collectionApi';

vi.mock('../modules/product-analysis/services/collectionApi',()=>({fetchCollectorSyncStatus:vi.fn(),listCollectionRuns:vi.fn(),fetchCollectionRun:vi.fn()}));
const state:api.CollectorSyncStatus={lastPluginSyncedAt:null,syncedToday:false,active:false,shops:[]};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.fetchCollectorSyncStatus).mockResolvedValue(state);vi.mocked(api.listCollectionRuns).mockResolvedValue([]);});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

it('distinguishes plugin upload from data completeness and formats Beijing time',()=>{
  const view=render(<CollectorSyncSummary state={state}/>);
  expect(screen.getByText('尚未通过插件同步')).toBeInTheDocument();
  view.rerender(<CollectorSyncSummary state={{...state,lastPluginSyncedAt:'2026-10-02T08:05:00Z'}}/>);
  expect(screen.getByText('今日未同步 · 最近同步：2026-10-02 16:05')).toBeInTheDocument();
  view.rerender(<CollectorSyncSummary state={{...state,syncedToday:true,shops:[{shopId:'a',name:'A',site:'PH',status:'FAILED',from:'',to:'',completedDays:20,runId:'r',detail:'请重试'}]}} shopId="a"/>);
  expect(screen.getByText('今日已同步')).toBeInTheDocument();
  expect(screen.getByText(/补漏失败.*20\/30/)).toBeInTheDocument();
  expect(screen.getByText('请重试')).toBeInTheDocument();
});

it('polls busy work at four seconds and idle work at thirty seconds',async()=>{
  vi.useFakeTimers();
  vi.mocked(api.fetchCollectorSyncStatus).mockResolvedValueOnce({...state,active:true}).mockResolvedValue(state);
  function Harness(){useCollectorSyncStatus('a',true,()=>{});return null;}
  render(<Harness/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(api.fetchCollectorSyncStatus).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(4_000);});
  expect(api.fetchCollectorSyncStatus).toHaveBeenCalledTimes(2);
  await act(async()=>{await vi.advanceTimersByTimeAsync(29_999);});
  expect(api.fetchCollectorSyncStatus).toHaveBeenCalledTimes(2);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(api.fetchCollectorSyncStatus).toHaveBeenCalledTimes(3);
});

it('ignores a late previous-shop response and refreshes on import progress',async()=>{
  let resolve!:(s:api.CollectorSyncStatus)=>void;
  vi.mocked(api.fetchCollectorSyncStatus).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const imported=vi.fn();
  function Harness({shop}:{shop:string}){const {state:s}=useCollectorSyncStatus(shop,true,imported);return <CollectorSyncSummary state={s}/>;}
  const view=render(<Harness shop="a"/>);
  view.rerender(<Harness shop="b"/>);
  await waitFor(()=>expect(screen.getByText('尚未通过插件同步')).toBeInTheDocument());
  await act(async()=>resolve({...state,syncedToday:true}));
  expect(screen.queryByText('今日已同步')).toBeNull();
  expect(imported).not.toHaveBeenCalled();
});

it('pauses requests while hidden and immediately refreshes on becoming visible',async()=>{
  let visibility='hidden';
  vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility as DocumentVisibilityState);
  function Harness(){useCollectorSyncStatus('a',true);return null;}
  render(<Harness/>);
  expect(api.fetchCollectorSyncStatus).not.toHaveBeenCalled();
  visibility='visible';
  await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});
  expect(api.fetchCollectorSyncStatus).toHaveBeenCalledTimes(1);
});

it('refreshes analysis only when the selected run has newly imported days',async()=>{
  vi.useFakeTimers();
  const run={id:'run-a',shopId:'a',status:'ACTIVE',collectorBatchId:1,fromDate:'',toDate:'',createdAt:'',recollectExisting:false};
  vi.mocked(api.listCollectionRuns).mockResolvedValue([run]);
  const detail={run,batch:{counts:{IMPORTED:1},total:30},tasks:[],page:1,pages:1};
  vi.mocked(api.fetchCollectionRun).mockResolvedValueOnce(detail).mockResolvedValueOnce(detail)
    .mockResolvedValue({...detail,batch:{counts:{IMPORTED:2},total:30}});
  const imported=vi.fn();
  function Harness(){useCollectorSyncStatus('a',true,imported);return null;}
  render(<Harness/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(imported).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
  expect(imported).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
  expect(imported).toHaveBeenCalledTimes(2);
});

it('a task-detail failure does not hide a successful plugin sync',async()=>{
  vi.mocked(api.fetchCollectorSyncStatus).mockResolvedValue({...state,syncedToday:true});
  vi.mocked(api.listCollectionRuns).mockRejectedValue(new Error('temporary task error'));
  function Harness(){const status=useCollectorSyncStatus('a',true,()=>{});return <CollectorSyncSummary state={status.state} error={status.error}/>;}
  render(<Harness/>);
  await screen.findByText('今日已同步');
  expect(screen.queryByText('同步状态读取失败')).toBeNull();
});
