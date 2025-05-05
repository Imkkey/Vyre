<script lang="ts">
  export let id: number;
  export let name: string;
  export let lastMessage: string = '';
  export let unreadCount: number = 0;
  export let isActive: boolean = false;
</script>

<a href={`/chat/${id}`} class={`chat-list-item ${isActive ? 'active' : ''}`}>
  <div class="chat-item-header">
    <h3 class="chat-item-title">{name}</h3>
    {#if unreadCount > 0}
      <span class="unread-badge">{unreadCount}</span>
    {/if}
  </div>
  {#if lastMessage}
    <p class="chat-item-preview">{lastMessage}</p>
  {/if}
</a>

<style>
  .chat-list-item {
    display: block;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    border-radius: 0.5rem;
    transition: background-color 0.2s;
    text-decoration: none;
    color: var(--color-text-primary);
    background-color: var(--color-surface);
  }
  
  .chat-list-item:hover {
    background-color: #333;
    cursor: pointer;
  }
  
  .chat-list-item.active {
    background-color: rgba(100, 108, 255, 0.2);
  }
  
  .chat-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .chat-item-title {
    font-weight: 600;
    font-size: 1.125rem;
  }
  
  .chat-item-preview {
    font-size: 0.875rem;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .unread-badge {
    background-color: var(--color-secondary);
    color: white;
    font-size: 0.75rem;
    font-weight: bold;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
  }
</style>