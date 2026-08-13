import type { ToolSpec } from '../providers/types';

export const VAULT_TOOLS: ToolSpec[] = [
  {
    name: 'read_note',
    description: '读取 Vault 中一篇笔记的完整内容（路径相对 Vault 根目录，如 "Folder/Note.md"）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记路径，相对 Vault 根目录' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_note',
    description: '创建一篇新笔记，或覆盖已有笔记的全部内容（此操作会请求用户批准）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记路径，相对 Vault 根目录' },
        content: { type: 'string', description: '完整的 Markdown 内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'append_note',
    description: '向已有笔记末尾追加内容；笔记不存在时则创建（此操作会请求用户批准）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记路径，相对 Vault 根目录' },
        content: { type: 'string', description: '要追加的 Markdown 内容' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_folder',
    description: '列出 Vault 中某个文件夹下的笔记与子文件夹；不传 path 时列出根目录',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件夹路径，相对 Vault 根目录；省略则列出根目录' },
      },
    },
  },
  {
    name: 'search_notes',
    description: '按关键词搜索 Vault 中的笔记标题与内容，返回匹配文件与片段',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_properties',
    description: '读取一篇笔记的 frontmatter 属性（YAML 元数据）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记路径，相对 Vault 根目录' },
      },
      required: ['path'],
    },
  },
  {
    name: 'ask_user',
    description: '当需要用户澄清、确认或做选择时向用户提问；不要用此工具询问可以通过读取笔记获得的信息',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '可选的预设选项，最多 4 个；用户也可以输入自己的回答',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'update_properties',
    description: '更新一篇笔记的 frontmatter 属性，与已有属性合并（此操作会请求用户批准）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记路径，相对 Vault 根目录' },
        properties: {
          type: 'object',
          description: '要更新或新增的属性键值对，值为 null 时删除该属性',
        },
      },
      required: ['path', 'properties'],
    },
  },
];
