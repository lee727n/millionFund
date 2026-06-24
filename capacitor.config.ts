import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fundapp.realtime',
  appName: 'AI百万实盘',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'fund.eastmoney.com',
      'fundgz.1234567.com.cn',
      'push2.eastmoney.com',
      'fundmobapi.eastmoney.com',
      'fundf10.eastmoney.com',
      'api.fund.eastmoney.com',
      'qt.gtimg.cn',
      'web.ifzq.gtimg.cn',
      'www.jin10.com',  // [FIX] 添加金十数据域名
      'www.cls.cn',       // [FIX] 添加财联社域名
      'cdn.jsdelivr.net'
    ]
  }
};

export default config;
