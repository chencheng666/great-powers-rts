// 仅恢复本控制器造成的后台暂停，不能解除玩家主动暂停、菜单或读档暂停。
export class BackgroundPause {
  constructor() { this.game = null; }

  hide(game) {
    if (this.game !== game) this.game = null;
    if (!game?.running || game.online || game.paused) return false;
    this.game = game;
    game.paused = true;
    return true;
  }

  resume(game, blocked = false) {
    if (this.game !== game) { this.cancel(); return false; }
    if (blocked) return false;
    this.cancel();
    if (!game?.running || game.online || game.winner != null) return false;
    game.paused = false;
    return true;
  }

  cancel() { this.game = null; }
}
