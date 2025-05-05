<script lang="ts">
  export let content: string;
  export let username: string;
  export let timestamp: string;
  export let isCurrentUser: boolean = false;
</script>

<div class={`message-container ${isCurrentUser ? 'current-user' : ''}`}>
  <div class={`message ${isCurrentUser ? 'message-sent' : 'message-received'}`}>
    <div class="message-header">
      <span class="message-username">{username}</span>
      <span class="message-timestamp">{timestamp}</span>
    </div>
    <p class="message-content">{content}</p>
  </div>
</div>

<style>
  .message-container {
    display: flex;
    margin-bottom: 1rem;
  }
  
  .message-container.current-user {
    justify-content: flex-end;
  }
  
  .message {
    max-width: 70%;
    border-radius: 0.75rem;
    padding: 0.75rem;
  }
  
  .message-sent {
    background-color: var(--color-primary);
    color: white;
  }
  
  .message-received {
    background-color: var(--color-surface);
  }
  
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .message-username {
    font-weight: 600;
  }
  
  .message-timestamp {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  
  .message-content {
    font-size: 0.875rem;
  }
</style>