import type { PageServerLoad } from './$types';
import finlandGeojson from '$lib/interactive/finland_kunnat_2km.geojson?raw';
import { loadGeometry } from '$lib/interactive/loadGeometry';
import { EMPTY_POPULATION_STATS } from '$lib/interactive/population';
import type { KuntaCollection } from '$lib/interactive/finland';

// Geometry only, at build time — every figure arrives from `/data/` when the page opens (see
// `loadCompare` in `liveData.ts`), which is what lets the figures be refreshed without touching
// the build. The GeoJSON itself never ships: 475 kB in, 308 paths and their bounding boxes out.
export const load: PageServerLoad = () => {
	const kunnatCollection = JSON.parse(finlandGeojson) as KuntaCollection;

	return { finland: loadGeometry(kunnatCollection, { emptyStats: EMPTY_POPULATION_STATS }) };
};
