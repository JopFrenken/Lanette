import { ICommandDefinition } from "../../command-parser";
import { Player } from "../../room-activity";
import { Game } from "../../room-game";
import { IGameTemplateFile, GameCommandReturnType } from "../../types/games";
import { IAbility, IItem, IMove, IPokemon } from "../../types/dex";

export type Link = IPokemon | IMove | IItem | IAbility;

export abstract class Chain extends Game {
	acceptsFormes: boolean = false;
	canReverseLinks: boolean = false;
	currentPlayer: Player | null = null;
	keys: string[] = [];
	letterBased: boolean = true;
	linkEndCounts: Dict<number> = {};
	linkEnds: Dict<number> = {};
	linkLength: number = 1;
	linkStartCounts: Dict<number> = {};
	linkStarts: Dict<number> = {};
	linksType: string = 'Pokemon';
	maxPlayers: number = 20;
	playerList: Player[] = [];
	points = new Map<Player, number>();
	pool: Dict<Link> = {};
	roundLinks: Dict<boolean> = {};
	roundTime: number = 7 * 1000;
	survivalRound: number = 0;
	targetLinkEnds: string[] = [];
	targetLinkStarts: string[] = [];

	// always defined once the game starts
	currentLink!: Link;

	getLinkStarts(link: Link): string[] {
		const start = link.id.substr(0, this.linkLength);
		if (!isNaN(parseInt(start))) return [];
		return [start];
	}

	getLinkEnds(link: Link): string[] {
		const end = link.id.substr(-1, this.linkLength);
		if (!isNaN(parseInt(end))) return [];
		return [end];
	}

	onSignups(): void {
		const pool: Dict<Link> = {};
		const keys: string[] = [];
		if (this.variant) {
			if (this.variant === 'moves') {
				const moves = Games.getMovesList();
				for (const move of moves) {
					if (this.letterBased) {
						if (move.id === 'hiddenpower') continue;
						if (!this.getLinkStarts(move).length || !this.getLinkEnds(move).length) continue;
					}
					pool[move.id] = move;
					keys.push(move.id);
				}
				this.linksType = 'move';
			} else if (this.variant === 'items') {
				const items = Games.getItemsList();
				for (const item of items) {
					if (this.letterBased && (!this.getLinkStarts(item).length || !this.getLinkEnds(item).length)) continue;
					pool[item.id] = item;
					keys.push(item.id);
				}
				this.linksType = 'item';
			} else if (this.variant === 'abilities') {
				const abilities = Games.getAbilitiesList();
				for (const ability of abilities) {
					if (this.letterBased && (!this.getLinkStarts(ability).length || !this.getLinkEnds(ability).length)) continue;
					pool[ability.id] = ability;
					keys.push(ability.id);
				}
				this.linksType = 'ability';
			} else {
				throw new Error("Game variation'" + this.variant + "' has no pool");
			}
		} else {
			const pokedex = Games.getPokemonList();
			for (const pokemon of pokedex) {
				if (pokemon.forme && !this.acceptsFormes) continue;
				if (this.letterBased && (!this.getLinkStarts(pokemon).length || !this.getLinkEnds(pokemon).length)) continue;
				pool[pokemon.id] = pokemon;
				keys.push(pokemon.id);
			}
		}
		this.pool = pool;
		this.keys = keys;

		const linkStartsByName: Dict<string[]> = {};
		const linkEndsByName: Dict<string[]> = {};
		for (const i in pool) {
			const starts = this.getLinkStarts(pool[i]);
			for (const start of starts) {
				if (!linkStartsByName[start]) linkStartsByName[start] = [];
				if (!linkStartsByName[start].includes(pool[i].id)) linkStartsByName[start].push(pool[i].id);
			}
			if (this.canReverseLinks) {
				const ends = this.getLinkEnds(pool[i]);
				for (const end of ends) {
					if (!linkEndsByName[end]) linkEndsByName[end] = [];
					if (!linkEndsByName[end].includes(pool[i].id)) linkEndsByName[end].push(pool[i].id);
				}
			}
		}

		for (const i in linkStartsByName) {
			this.linkStarts[i] = linkStartsByName[i].length;
		}

		for (const i in linkEndsByName) {
			this.linkEnds[i] = linkEndsByName[i].length;
		}

		if (this.format.options.freejoin) this.timeout = setTimeout(() => this.nextRound(), 5000);
	}

	onStart(): void {
		this.nextRound();
	}

	filterUnusableLinkStarts(links: string[]): string[] {
		const filtered: string[] = [];
		for (const link of links) {
			if (!this.linkStarts[link] || this.linkStartCounts[link] === this.linkStarts[link]) continue;
			filtered.push(link);
		}
		return filtered;
	}

	filterUnusableLinkEnds(links: string[]): string[] {
		const filtered: string[] = [];
		for (const link of links) {
			if (!this.linkEnds[link] || this.linkEndCounts[link] === this.linkEnds[link]) continue;
			filtered.push(link);
		}
		return filtered;
	}

	resetLinkCounts(): void {
		this.roundLinks = {};
		this.linkStartCounts = {};
		this.linkEndCounts = {};
	}

	setLink(input?: string): void {
		let id = Tools.toId(input) || this.sampleOne(this.keys);
		let link = this.pool[id];
		let linkStarts = this.getLinkStarts(link);
		let linkEnds = this.getLinkEnds(link);
		this.markLinkUsed(linkStarts, linkEnds);
		let nextLinkStarts = this.filterUnusableLinkStarts(linkEnds);
		let nextLinkEnds: string[] = [];
		if (this.canReverseLinks) nextLinkEnds = this.filterUnusableLinkEnds(linkStarts);
		let linkToSkip: Link | null = null;
		while (this.currentLink === link || (!nextLinkStarts.length && !nextLinkEnds.length) || (linkToSkip && this.currentLink === linkToSkip)) {
			if (input && this.playerList.length) {
				const list = Tools.joinList(nextLinkStarts.concat(nextLinkEnds).map(x => x.toUpperCase()));
				this.say("There are no " + (list ? "'" + list + "' " + this.linksType + " links left" : "links with " + link.name) + "! Substituting in a random " +
					this.linksType + ".");
				input = '';
				if (!linkToSkip) linkToSkip = this.pool[id];
			}
			this.resetLinkCounts();
			id = this.sampleOne(this.keys);
			link = this.pool[id];
			linkStarts = this.getLinkStarts(link);
			linkEnds = this.getLinkEnds(link);
			this.markLinkUsed(linkStarts, linkEnds);
			nextLinkStarts = this.filterUnusableLinkStarts(linkEnds);
			if (this.canReverseLinks) nextLinkEnds = this.filterUnusableLinkEnds(linkStarts);
		}
		this.currentLink = link;
		this.targetLinkStarts = nextLinkStarts;
		this.targetLinkEnds = nextLinkEnds;
		this.roundLinks[this.currentLink.id] = true;
	}

	onNextRound(): void {
		let text;
		if (this.format.options.freejoin) {
			this.resetLinkCounts();
			this.setLink();
			text = "The " + this.mascot!.name + " spelled out **" + this.currentLink.name + "**.";
			this.on(text, () => {
				this.timeout = setTimeout(() => {
					this.say("Time is up!");
					this.nextRound();
				}, this.roundTime);
			});
		} else {
			if (!this.playerList.length) {
				if (this.getRemainingPlayerCount() < 2 || this.survivalRound >= 20) {
					this.end();
					return;
				}
				this.survivalRound++;
				this.playerList = this.shufflePlayers();
				if (this.survivalRound > 1 && this.roundTime > 3000) this.roundTime -= 500;
				this.resetLinkCounts();
				this.setLink();
				const html = this.getRoundHtml(this.getPlayerNames, null, "Round " + this.survivalRound);
				const uhtmlName = this.uhtmlBaseName + '-round-html';
				this.onUhtml(uhtmlName, html, () => {
					this.timeout = setTimeout(() => this.nextRound(), 5 * 1000);
				});
				this.sayUhtml(uhtmlName, html);
				return;
			}

			let currentPlayer = this.playerList.shift();
			while (currentPlayer && currentPlayer.eliminated) {
				currentPlayer = this.playerList.shift();
			}
			if (!currentPlayer || currentPlayer.eliminated) {
				this.onNextRound();
				return;
			}

			text = currentPlayer.name + " you are up! The " + this.mascot!.name + " spelled out **" + this.currentLink.name + "**.";
			this.on(text, () => {
				this.currentPlayer = currentPlayer!;
				this.timeout = setTimeout(() => {
					this.say("Time is up!");
					this.eliminatePlayer(this.currentPlayer!, "You did not guess a " + this.linksType + " link!");
					this.currentPlayer = null;
					this.nextRound();
				}, this.roundTime);
			});
		}
		this.say(text);
	}

	onEnd(): void {
		if (this.format.options.freejoin) return;
		for (const i in this.players) {
			if (this.players[i].eliminated) continue;
			const player = this.players[i];
			this.winners.set(player, 1);
			this.addBits(player, 500);
		}

		this.announceWinners();
	}

	markLinkUsed(linkStarts: string[], linkEnds: string[]): void {
		for (const start of linkStarts) {
			if (!this.linkStarts[start]) continue;
			if (!this.linkStartCounts[start]) this.linkStartCounts[start] = 0;
			this.linkStartCounts[start]++;
		}
		for (const end of linkEnds) {
			if (!this.linkEnds[end]) continue;
			if (!this.linkEndCounts[end]) this.linkEndCounts[end] = 0;
			this.linkEndCounts[end]++;
		}
	}
}

const commands: Dict<ICommandDefinition<Chain>> = {
	guess: {
		command(target, room, user): GameCommandReturnType {
			if (this.format.options.freejoin) {
				if ((!this.targetLinkStarts.length && !this.targetLinkEnds.length) || (this.players[user.id] && this.players[user.id].eliminated)) return false;
			} else {
				if (this.players[user.id] !== this.currentPlayer) return false;
			}
			const guess = Tools.toId(target);
			if (this.roundLinks[guess]) return false;
			const possibleLink: Link | undefined = this.pool[guess];
			if (!possibleLink) {
				if (!this.format.options.freejoin) this.say("'" + guess + "' is not a valid " + this.linksType + ".");
				return false;
			}
			const linkStarts = this.getLinkStarts(possibleLink);
			let linkEnds: string[] = [];
			if (this.canReverseLinks) linkEnds = this.getLinkEnds(possibleLink);
			let match = false;
			for (const start of linkStarts) {
				if (this.targetLinkStarts.includes(start)) {
					match = true;
					break;
				}
			}
			if (!match && this.canReverseLinks) {
				for (const end of linkEnds) {
					if (this.targetLinkEnds.includes(end)) {
						match = true;
						break;
					}
				}
			}
			if (!match) return false;
			if (this.timeout) clearTimeout(this.timeout);
			if (this.format.options.freejoin) {
				this.targetLinkStarts = [];
				this.targetLinkEnds = [];
				const player = this.createPlayer(user) || this.players[user.id];
				let points = this.points.get(player) || 0;
				points++;
				this.points.set(player, points);
				if (points === this.format.options.points) {
					this.say('**' + player.name + '** wins' + (this.parentGame ? '' : ' the game') + '! A possible answer was __' + possibleLink.name + '__.');
					this.winners.set(player, 1);
					this.convertPointsToBits(50);
					this.end();
					return true;
				}
				this.say('**' + player.name + '** advances to **' + points + '** point' + (points > 1 ? 's' : '') + '! A possible answer was __' + possibleLink.name + '__.');
				this.timeout = setTimeout(() => this.nextRound(), 5000);
			} else {
				this.currentPlayer = null;
				this.setLink(guess);
				this.nextRound();
			}
			return true;
		},
		aliases: ['g'],
	},
};

export const game: IGameTemplateFile<Chain> = {
	category: 'chain',
	commands,
};
