import { fetchEventSource } from '@microsoft/fetch-event-source';

/** 创建消息流 */
export function createEventStream<T = any>(url: string, params: T, callbacks: {
  onopen?: (response: Response) => Promise<void>;
  onmessage?: (msg: any) => void;
  onclose?: () => void;
  onerror?: (err: any) => void;
}) {
  const controller = new AbortController();
  
  fetchEventSource(url, {
    signal: controller.signal,                       // 支持中断对话流程
    method: 'POST',                                  // 支持结构化数据传输
    headers: { 'Content-Type': 'application/json' }, // 必需设置JSON格式
    openWhenHidden: true,                            // 保持后台标签页连接
    body: JSON.stringify(params),                    // 参数序列化
    // 流式通信生命周期钩子
    async onopen(response) {
      if (callbacks.onopen) {
        await callbacks.onopen(response);
      }
    },
    onmessage(msg) {
      if (callbacks.onmessage) {
        callbacks.onmessage(msg);
      }
    },
    onclose() {
      if (callbacks.onclose) {
        callbacks.onclose();
      }
    },
    onerror(err) {
      if (callbacks.onerror) {
        callbacks.onerror(err);
      }
    }
  });
  
  return controller;
}
