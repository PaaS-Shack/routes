"use strict";

const DbService = require("db-mixin");

const Membership = require("membership-mixin");

const { MoleculerClientError } = require("moleculer").Errors;
const crypto = require("crypto");

/**
 * Addons service
 */
module.exports = {
	name: "routers",
	version: 1,

	mixins: [
		DbService({})
	],

	/**
	 * Service dependencies
	 */
	dependencies: [],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/routers",


		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},
			node: {
				type: "string",
				required: true
			},
			zone: {
				type: "string",
				required: true
			},
			priority: {
				type: "number",
				default: 5,
				required: false
			},
			ipv4: {
				type: "string",
				required: true
			},
			ipv6: {
				type: "string",
				required: false
			},
			enabled: {
				type: "boolean",
				default: true,
				required: false
			},

			options: { type: "object" },
			createdAt: {
				type: "number",
				readonly: true,
				onCreate: () => Date.now()
			},
			updatedAt: {
				type: "number",
				readonly: true,
				onUpdate: () => Date.now()
			},
			deletedAt: {
				type: "number",
				readonly: true,
				hidden: "byDefault",
				onRemove: () => Date.now()
			}

		},
		defaultPopulates: [],

		scopes: {
			notDeleted: { deletedAt: null },
		},

		defaultScopes: ["notDeleted"]
	},
	/**
	 * Actions
	 */
	actions: {
		create: {
			permissions: ['routes.create']
		},
		list: {
			permissions: ['routes.list']
		},
		find: {
			rest: "GET /find",
			permissions: ['routes.find']
		},
		count: {
			rest: "GET /count",
			permissions: ['routes.count']
		},
		get: {
			needEntity: true,
			permissions: ['routes.get']
		},
		update: {
			needEntity: true,
			permissions: ['routes.update']
		},
		replace: false,
		remove: {
			needEntity: true,
			permissions: ['routes.remove']
		},

		addvHost: {
			params: {
				vHost: { type: "string", optional: true },
				owner: { type: "string", optional: true },
			},
			permissions: ['routes.resolveRoute'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const options = { meta: { userID: params.owner } }

				const routers = await this.findEntities(null, {
					query: {
						enabled: true
					}
				})
				for (let index = 0; index < routers.length; index++) {
					const router = routers[index];
					let record = await ctx.call(`v1.domains.addRecord`, {
						fqdn: params.vHost,
						type: 'A',
						data: router.ipv4
					}, options);
					this.logger.info(`Added record ${record.id}(${router.ipv4}) for vHost ${params.vHost}`)
				}
			},
		},
		removevHost: {
			params: {
				vHost: { type: "string", optional: true },
				owner: { type: "string", optional: true },
			},
			permissions: ['routes.resolveRoute'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const options = { meta: { userID: params.owner } }

				const routers = await this.findEntities(null, {
					query: {
						enabled: true
					}
				})
				for (let index = 0; index < routers.length; index++) {
					const router = routers[index];
					let record = await ctx.call(`v1.domains.removeRecord`, {
						fqdn: params.vHost,
						type: 'A',
						data: router.ipv4
					}, options);
					this.logger.info(`Removed record ${record?.id}(${router.ipv4}) for vHost ${params.vHost}`)
				}
			},
		},
	},


	/**
	 * Events
	 */
	events: {
		"routes.created": {
			async handler(ctx) {
				const route = Object.assign({}, ctx.params.data);
				await this.actions.addvHost({
					vHost: route.vHost,
					owner: route.owner.id
				})
			}
		},
		"routes.removed": {
			async handler(ctx) {
				const route = Object.assign({}, ctx.params.data);
				await this.actions.removevHost({
					vHost: route.vHost,
					owner: route.owner.id
				})
			}
		},
		"routers.created": {
			async handler(ctx) {
				const router = Object.assign({}, ctx.params.data);
				if (router.enabled) {
					const routes = await ctx.call('v1.routes.vHosts')
					for (let index = 0; index < routes.length; index++) {
						const route = routes[index];
						const options = { meta: { userID: route.owner } }
						let record = await ctx.call(`v1.domains.addRecord`, {
							fqdn: route.vHost,
							type: 'A',
							data: router.ipv4
						}, options);
						this.logger.info(`Added record ${record?.id}(${router.ipv4}) for vHost ${route.vHost}`)
					}
				}
			}
		},
		"routers.removed": {
			async handler(ctx) {
				const router = Object.assign({}, ctx.params.data);
				if (router.enabled) {
					const routes = await ctx.call('v1.routes.vHosts')
					for (let index = 0; index < routes.length; index++) {
						const route = routes[index];
						const options = { meta: { userID: route.owner } }
						let record = await ctx.call(`v1.domains.removeRecord`, {
							fqdn: route.vHost,
							type: 'A',
							data: router.ipv4
						}, options);
						this.logger.info(`Removed record ${record?.id}(${router.ipv4}) for vHost ${route.vHost}`)
					}
				}
			}
		}
	},

	/**
	 * Methods
	 */
	methods: {

	},

	/**
	 * Service created lifecycle event handler
	 */
	created() { },

	/**
	 * Service started lifecycle event handler
	 */
	started() { },

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};