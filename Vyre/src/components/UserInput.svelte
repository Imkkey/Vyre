<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let placeholder: string = 'Введите сообщение...';
  let message: string = '';
  
  const dispatch = createEventDispatcher();
  
  function handleSubmit() {
    if (message.trim()) {
      dispatch('send', message);
      message = '';
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="user-input">
  <div class="input-group">
    <textarea 
      bind:value={message}
      on:keydown={handleKeydown}
      class="message-textarea" 
      placeholder={placeholder}
    ></textarea>
    <button 
      on:click={handleSubmit} 
      class="send-button"
      disabled={!message.trim()}
      aria-label="Отправить сообщение"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    </button>
  </div>
</div>

<style>
  .user-input {
    background-color: var(--color-surface);
    padding: 0.75rem;
    border-radius: 0.75rem;
  }
  
  .input-group {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }
  
  .message-textarea {
    flex: 1;
    background-color: transparent;
    border: 1px solid #444;
    border-radius: 0.5rem;
    padding: 0.75rem;
    resize: none;
    min-height: 80px;
  }
  
  .message-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(100, 108, 255, 0.3);
  }
  
  .send-button {
    background-color: var(--color-primary);
    color: white;
    padding: 0.75rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .send-button:hover {
    background-color: var(--color-accent);
  }
  
  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>