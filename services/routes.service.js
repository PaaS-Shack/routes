"use strict";

const DbService = require("db-mixin");

const Membership = require("membership-mixin");

const { MoleculerClientError } = require("moleculer").Errors;
const crypto = require("crypto");

/**
 * Addons service
 */
module.exports = {
	name: "routes",
	version: 1,

	mixins: [
		DbService({

		}),
		Membership({
			permissions: 'routes'
		})
	],

	/**
	 * Service dependencies
	 */
	dependencies: [],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/routes",


		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},

			vHost: {
				type: "string",
				min: 3,
				lowercase: true,
				required: true,
				validate: 'validatevHost'
			},

			zone: {
				type: "string",
				default: null,
				required: false
			},

			metricSession: {
				type: "string",
				set() { return this.generateSession() }
			},
			logSession: {
				type: "string",
				set() { return this.generateSession() }
			},

			certs: {
				type: "boolean",
				default: true,
				required: false
			},
			auth: {
				type: "string",
				default: null,
				required: false
			},

			strategy: {
				type: "enum",
				default: 'LatencyStrategy',
				values: ["RandomStrategy", "IPHashStrategy", "LatencyStrategy", "RoundRobinStrategy"],
				required: false
			},

			hosts: {
				type: "array",
				virtual: true,
				populate: {
					action: "v1.routes.hosts.list",
					params: {
						fields: ["id", "hostname", "port"]
					}
				}
			},

			hostCount: {
				type: "number",
				virtual: true,
				populate: function (ctx, values, entities, field) {
					return Promise.all(
						entities.map(async entity => {
							return await ctx.call("v1.routes.hosts.count", { route: this.encodeID(entity._id) })
						})
					);
				}
			},
			...Membership.FIELDS,

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
		defaultPopulates: ["hosts", "owner"],

		scopes: {
			notDeleted: { deletedAt: null },
			...Membership.SCOPE,
		},

		defaultScopes: ["notDeleted", ...Membership.DSCOPE]
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

		resolveRoute: {
			params: {
				vHost: { type: "string", optional: true },
			},
			permissions: ['routes.resolveRoute'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntity(null, {
					query: {
						vHost: params.vHost,
						deletedAt: null
					},
					fields: ['id', 'vHost', 'owner'],
					scope: false
				})
			},
		},
		vHosts: {
			params: {
				zone: { type: "string", optional: true },
			},
			permissions: ['routes.vHosts'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				return this.findEntities(null, {
					query: {
						zone: params.zone
					},
					fields: ['id', 'vHost', 'owner', 'deletedAt'],
					scope: '-membership'
				})
			},
		},
        sync: {
            rest: "GET /sync",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            permissions: ['routes.sync'],
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.proxy.agent.sync').then((res)=>res.filter((item) => item.status == 'fulfilled'))
            }
        },
        stats: {
            rest: "GET /stats",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            permissions: ['routes.stats'],
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.proxy.agent.stats').then((res)=>res.filter((item) => item.status == 'fulfilled'))
            }
        },
        info: {
            rest: "GET /info",
            params: {
                target: { type: "string", min: 3, optional: true },
            },
            permissions: ['routes.info'],
            async handler(ctx) {
                return this.scrapeAgents(ctx, 'v1.proxy.agent.info').then((res)=>res.filter((item) => item.status == 'fulfilled'))
            }
        },
	},


	/**
	 * Events
	 */
	events: {

	},

	/**
	 * Methods
	 */
	methods: {

        async scrapeAgents(ctx, action, params = {}) {
            const list = await ctx.call("$node.list");

            const result = [];
            const promises = [];
            for (let index = 0; index < list.length; index++) {
                const node = list[index];
                promises.push(ctx.call(action, params, { nodeID: node.id }));
            }

            const settled = await Promise.allSettled(promises);
            for (let index = 0; index < list.length; index++) {
                const node = list[index];
                result.push({
                    nodeID: node.id,
                    status: settled[index].status,
                    info: settled[index].value,
                    reason: settled[index].reason,
                });
            }

            return result
        },
		generateSession() {
			return crypto.randomBytes(10).toString("hex");
		},

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
		validatevHost({ ctx, params, value }) {
			return this.countEntities(ctx, {
				query: {
					vHost: value,
					deletedAt: null
				},
				scope: false
			}, { transform: false, scope: false })
				.then(res =>
					res == 0
						? true
						: `The name app '${params.vHost}' is already attached to '${params.port}' as '${value}'.`
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
