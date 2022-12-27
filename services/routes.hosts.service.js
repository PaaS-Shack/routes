"use strict";

const DbService = require("db-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

/**
 * attachments of addons service
 */
module.exports = {
	name: "routes.hosts",
	version: 1,

	mixins: [
		DbService({}),
	],

	/**
	 * Service dependencies
	 */
	dependencies: [
		{ name: "routes", version: 1 }
	],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/routes/:route/hosts",

		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},
			route: {
				type: "string",
				required: true,
				immutable: true,
				populate: {
					action: "v1.routes.resolve",
					params: {
						fields: ["id", "name", "vHost", "auth"]
					}
				},
				validate: 'validateRoute',
			},

			hostname: {
				type: "string",
				empty: false,
				required: true,
				validate: 'validateHostname',
			},
			port: {
				type: "number",
				required: true
			},

			weight: {
				type: "number",
				default: 200,
				required: false
			},
			vnodes: {
				type: "number",
				default: 50,
				required: false
			},

			group: {
				type: "enum",
				default: "BLUE",
				values: ["BLUE", 'GREEN'],
				required: false
			},

			protocol: {
				type: "enum",
				default: "http:",
				values: ["http:", 'https:'],
				required: false
			},

			cluster: {
				type: "string",
				default: "default",
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

		scopes: {
			async route(query, ctx, params) { return this.validateHasRoutePermissions(query, ctx, params) },
			notDeleted: { deletedAt: null }
		},

		defaultScopes: ["route", "notDeleted"]
	},

	/**
	 * Actions
	 */

	actions: {
		create: {
			permissions: ['routes.hosts.create']
		},
		list: {
			permissions: ['routes.hosts.list'],
			params: {
				route: { type: "string" }
			}
		},

		find: {
			rest: "GET /find",
			permissions: ['routes.hosts.find'],
			params: {
				//route: { type: "string" }
			}
		},

		count: {
			rest: "GET /count",
			permissions: ['routes.hosts.count'],
			params: {
				route: { type: "string" }
			}
		},

		get: {
			needEntity: true,
			permissions: ['routes.hosts.get']
		},

		update: {
			needEntity: true,
			permissions: ['routes.hosts.update']
		},

		replace: false,

		remove: {
			needEntity: true,
			permissions: ['routes.hosts.remove']
		},
		resolveHost: {
			params: {
				route: { type: "string", optional: false },
				hostname: { type: "string", optional: false },
				port: { type: "number", optional: false },
			},
			permissions: ['routes.hosts.remove'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntity(ctx, {
					route: params.route,
					query: {
						hostname: params.hostname,
						port: params.port,
						deletedAt: null
					},
					scope: false
				})
			},

		},
		findAndRemove: {
			params: {

			},
			permissions: ['routes.hosts.remove'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntity(ctx, {
					query: {
						...params
					},
					scope: false
				}).then((entity) => {
					if (entity)
						return this.removeEntity(ctx, { id: entity.id })
					return entity
				})
			},

		},
	},

	/**
	 * Events
	 */
	events: {

		async "routes.removed"(ctx) {
			const route = ctx.params.data;
			try {
				const attachments = await this.findEntities(ctx, {
					query: { route: route.id },
					fields: ["id"],
					scope: false
				});
				await this.Promise.all(
					attachments.map(attachment => this.removeEntity(ctx, { id: attachment.id, scope: false }))
				);
			} catch (err) {
				this.logger.error(`Unable to delete attachments of route '${route.id}'`, err);
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
		async validateHasRoutePermissions(query, ctx, params) {
			// Adapter init
			if (!ctx) return query;

			if (params.route) {
				const res = await ctx.call("v1.routes.resolve", {
					id: params.route,
					throwIfNotExist: false
				});
				if (res) {
					query.route = params.route;
					return query;
				}
				throw new MoleculerClientError(
					`You have no right for the route '${params.route}'`,
					403,
					"ERR_NO_PERMISSION",
					{ route: params.route }
				);
			}
			if (ctx.action.params.route && !ctx.action.params.route.optional) {
				throw new MoleculerClientError(`route is required`, 422, "VALIDATION_ERROR", [
					{ type: "required", field: "route" }
				]);
			}
		},
		validateRoute(args) {
			const { ctx, params, value } = args
			return ctx.call("v1.routes.resolve", {
				id: params.route,
				throwIfNotExist: false,
				fields: ['id']
			}).then(res => {
				if (res) {
					return true
				} else {
					return true// `route '${params.route}' is not a multi attach instance.`
				}
			}
			).catch(err => err);
		},
		validateHostname({ ctx, params, value }) {
			return this.countEntities(ctx, {
				query: {
					route: params.route,
					port: params.port,
					hostname: value,
					deletedAt: null
				},
				scope: false
			}, { transform: false, scope: false })
				.then(res =>
					res == 0
						? true
						: `The name app '${params.route}' is already attached to '${params.port}' as '${value}'.`
				)
			//.catch(err => err.message);
		}
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