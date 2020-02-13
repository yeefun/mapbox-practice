import { MAPBOXGL_ACCESS_TOKEN } from '/api/config.js'

const DEFAULT_CENTER = [ 121.564008, 25.037891 ]
const DEFAULT_ZOOM = 8

mapboxgl.accessToken = MAPBOXGL_ACCESS_TOKEN

const positionBtn = document.getElementById('position')
const addressSearchBtn = document.getElementById('address-search')
const addressInputBtn = document.getElementById('address-input')


const map = new mapboxgl.Map({
  container: 'map',
  /**
   * optimize=true
   * style-optimized vector tiles
   * https://docs.mapbox.com/help/glossary/style-optimized-vector-tiles/
   */
  style: 'mapbox://styles/mapbox/dark-v10?optimize=true',
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM
})

map.once('load', loadData)

function loadData () {
  // var language = new MapboxLanguage({
  //   defaultLanguage: 'zh'
  // });
  // map.addControl(language)
  map.setLayoutProperty('country-label', 'text-field', ['get', 'name_zh'])
  map.setLayoutProperty('state-label', 'text-field', ['get', 'name_zh'])
  // Add a new source from our GeoJSON data and set the
  // 'cluster' option to true. GL-JS will add the point_count property to your source data.
  map.addSource('pharmacy', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/kiang/pharmacies/master/json/points.json',
    cluster: true,
    // Max zoom to cluster points on
    clusterMaxZoom: 14
  })
  map.addLayer({
    id: 'pharmacy-clusters',
    type: 'circle',
    source: 'pharmacy',
    filter: [ 'has', 'point_count' ],
    paint: {
      // Use step expressions (https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-step)
      // with three steps to implement three types of circles:
      //   * Blue, 20px circles when point count is less than 100
      //   * Yellow, 30px circles when point count is between 100 and 750
      //   * Pink, 40px circles when point count is greater than or equal to 750
      'circle-color': [
        'step',
        [ 'get', 'point_count' ],
        '#51bbd6',
        100, '#f1f075',
        750, '#f28cb1'
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20,
        100, 30,
        750, 40
      ]
    }
  })

  map.addLayer({
    id: 'pharmacy-count',
    type: 'symbol',
    source: 'pharmacy',
    filter: [ 'has', 'point_count' ],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-size': 12
    }
  })

  map.addLayer({
    id: 'pharmacy-unclustered-point',
    type: 'circle',
    source: 'pharmacy',
    filter: [ '!', [ 'has', 'point_count' ] ],
    paint: {
      'circle-color': '#a5e163',
      'circle-radius': 8,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  })

  map.on('click', 'pharmacy-clusters', function (evt) {
    // Returns an array of GeoJSON Feature objects representing visible features that satisfy the query parameters.
    const features = map.queryRenderedFeatures(evt.point, {
      layers: [ 'pharmacy-clusters' ]
    })
    const { cluster_id: clusterId } = features[ 0 ].properties
    const { coordinates } = features[ 0 ].geometry
    // For clustered sources, fetches the zoom at which the given cluster expands.
    map.getSource('pharmacy').getClusterExpansionZoom(
      clusterId,
      function (err, zoom) {
        if (err) { throw err }
        // Changes any combination of center, zoom, bearing, and pitch, with an animated transition between old and new values. The map will retain its current values for any details not specified in options.
        map.easeTo({
          center: coordinates,
          zoom
        })
      }
    )
  })

  map.on('click', 'pharmacy-unclustered-point', function (evt) {
    const features = map.queryRenderedFeatures(evt.point, {
      layers: [ 'pharmacy-unclustered-point' ]
    })
    const { geometry, properties } = features[ 0 ]
    addPopup(geometry, properties)
  })

  map.on('mouseenter', 'pharmacy-clusters', function () {
    // Returns the HTML canvas element.
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'pharmacy-clusters', function () {
    map.getCanvas().style.cursor = ''
  })

  // User Interface:
  // https://docs.mapbox.com/mapbox-gl-js/api/#user%20interface

  // map.addControl(new mapboxgl.GeolocateControl({
  //   // positionOptions: {
  //   //   enableHighAccuracy: true
  //   // },
  //   // trackUserLocation: true
  // }))
}

function addPopup ({ coordinates }, {
  name,
  phone,
  address,
  mask_adult: maskAdult,
  mask_child: maskChild,
  note,
  updated,
}) {
  new mapboxgl.Popup()
    .setLngLat(coordinates)
    .setHTML(`
      <h2>${name}</h2>
      <p>${phone}</p>
      <p>${address}</p>
      <hr/>
      <p>成人口罩數量：${maskAdult}</p>
      <p>兒童口罩數量：${maskChild}</p>
      <p>備註：${note}</p>
      <p>${updated} 更新</p>
    `)
    .addTo(map)
}

positionBtn.addEventListener('click', getCurrentPosition)
addressSearchBtn.addEventListener('click', searchAddress)

function getCurrentPosition () {
  const { geolocation } = navigator
  if (geolocation) {
    geolocation.getCurrentPosition(
      function (pos) {
        const { longitude: lng, latitude: lat } = pos.coords
        const coordinates = [ lng, lat ]
        map.easeTo({
          center: coordinates,
          zoom: 16
        })

        fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=TW&access_token=${mapboxgl.accessToken}`)
          .then((res) => res.json())
          .catch(function (err) { console.error(err) })
          .then((data) => {
            const feature = data.features[ 0 ]
            if (feature) {
              const { properties, place_name: placeName } = feature
              const { address } = properties
              addressInputBtn.value = (address ? address : placeName)
              addMarker(coordinates)
            }
          })
      },
      function (err) {
        console.error(err)
      }
    )
  } else {
    console.error('Browser doesn\'t support Geolocation')
  }
}

function searchAddress () {
  const { value } = addressInputBtn
  if (value) {
    // language=zh
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${value}.json?country=TW&access_token=${mapboxgl.accessToken}`)
      .then((res) => res.json())
      .catch(function (err) { console.error(err) })
      .then((data) => {
        const feature = data.features[ 0 ]
        if (feature) {
          const { coordinates } = feature.geometry
          map.easeTo({
            center: coordinates,
            zoom: 16
          })
          addMarker(coordinates)
        }
      })
  }
}

let marker = null
function addMarker (coordinates) {
  if (marker) {
    marker.remove()
  }
  const el = document.createElement('div')
  el.className = 'marker'
  marker = new mapboxgl.Marker(el)
    .setLngLat(coordinates)
    .addTo(map)
}

// const geocoder = new MapboxGeocoder({ accessToken: mapboxgl.accessToken })
// geocoder.addTo('#map')
