# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fund-add.spec.ts >> 基金添加流程 >> should search and add fund
- Location: e2e\fund-add.spec.ts:36:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e8]: AI 百万实盘
        - generic [ref=e10]:
          - generic [ref=e11]: 参考均线
          - generic [ref=e12]: +0.00%
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: 自动刷新开
          - switch [checked] [ref=e16] [cursor=pointer]
          - generic [ref=e18]: 
          - generic "复制日志" [ref=e19]: 
          - generic [ref=e20]: 
        - text:   
    - generic [ref=e22]:
      - generic [ref=e24]:
        - generic [ref=e25]: 自选基金
        - generic [ref=e26]: 1只
      - generic [ref=e28]: 最后刷新：14:36
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]:
            - generic [ref=e33]: 加载中...
            - generic [ref=e34]: "000001"
          - generic [ref=e35]:
            - generic [ref=e36]: "0.0000"
            - generic [ref=e37]: 0.00%
          - generic [ref=e39] [cursor=pointer]: 
        - button "删除" [ref=e41] [cursor=pointer]:
          - generic [ref=e43]: 删除
  - tablist [ref=e45]:
    - tab " 首页" [selected] [ref=e46] [cursor=pointer]:
      - generic [ref=e48]: 
      - generic [ref=e49]: 首页
    - tab " 自选" [ref=e50] [cursor=pointer]:
      - generic [ref=e52]: 
      - generic [ref=e53]: 自选
    - tab " 资产" [ref=e54] [cursor=pointer]:
      - generic [ref=e56]: 
      - generic [ref=e57]: 资产
    - tab " 资讯" [ref=e58] [cursor=pointer]:
      - generic [ref=e60]: 
      - generic [ref=e61]: 资讯
    - tab " 我的" [ref=e62] [cursor=pointer]:
      - generic [ref=e64]: 
      - generic [ref=e65]: 我的
```