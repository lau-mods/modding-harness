// 並列に進む milestone の間で、共有資源を使う処理を 1 つずつ順に実行させる
export class Mutex {
  private last: Promise<unknown> = Promise.resolve();

  // 先に要求された処理の終了を待ってから action を実行する
  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.last.then(action);
    this.last = result.catch(() => undefined);
    return result;
  }
}
