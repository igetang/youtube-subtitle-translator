/**
 * @file microsoft-auth-manager.ts
 * @description 负责获取并缓存微软翻译所需的 Edge Web 令牌
 */

const EDGE_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const DEFAULT_TTL = 1000 * 60 * 30; // 30分钟

interface FetchOptions extends RequestInit {
  headers: Record<string, string>;
}

/**
 * 单例：微软免费翻译令牌管理器
 */
export class MicrosoftAuthManager {
  private static instance: MicrosoftAuthManager | null = null;

  private token: string | null = null;
  private fetchedAt = 0;
  private readonly ttl: number;
  private pendingPromise: Promise<string> | null = null;

  private constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  public static getInstance(): MicrosoftAuthManager {
    if (!MicrosoftAuthManager.instance) {
      MicrosoftAuthManager.instance = new MicrosoftAuthManager();
    }
    return MicrosoftAuthManager.instance;
  }

  /**
   * 获取可用令牌
   * @param forceRefresh 是否强制刷新
   */
  public async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && Date.now() - this.fetchedAt < this.ttl) {
      return this.token;
    }

    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    this.pendingPromise = this.fetchToken().finally(() => {
      this.pendingPromise = null;
    });

    return this.pendingPromise;
  }

  /**
   * 主动使缓存失效
   */
  public invalidateToken(): void {
    this.token = null;
    this.fetchedAt = 0;
  }

  /**
   * 从微软接口获取新的 Edge 令牌
   */
  private async fetchToken(): Promise<string> {
    const requestOptions: FetchOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        Accept: '*/*',
        Origin: 'https://www.bing.com',
        Referer: 'https://www.bing.com/translator'
      }
    };

    const response = await fetch(EDGE_AUTH_URL, requestOptions);

    if (!response.ok) {
      throw new Error(`Failed to fetch Microsoft auth token: HTTP ${response.status}`);
    }

    const token = (await response.text()).trim();
    if (!token) {
      throw new Error('Received empty Microsoft auth token');
    }

    this.token = token;
    this.fetchedAt = Date.now();

    return token;
  }
}
