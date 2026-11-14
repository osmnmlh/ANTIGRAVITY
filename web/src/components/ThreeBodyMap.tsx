import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  BufferAttribute,
  Box3,
  BufferGeometry,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  metricDefinitions,
  type HealthStatus,
  type HealthType,
} from '../domain/types'

interface ThreeBodyMapProps {
  environment: 'iss' | 'lunar' | 'mars'
  statuses: Record<HealthType, HealthStatus>
  values: Record<HealthType, number | undefined>
  selected: HealthType
  focused: HealthType | null
  onSelect: (type: HealthType) => void
}

const markers: {
  type: HealthType
  position: [number, number, number]
  side: 'front' | 'back'
}[] = [
  { type: 'mood', position: [-0.12, 1.82, 0.24], side: 'front' },
  { type: 'heartRate', position: [0.12, 0.78, 0.35], side: 'front' },
  { type: 'spo2', position: [-0.04, 1.1, -0.42], side: 'back' },
  { type: 'bloodPressureSys', position: [-0.5, 0.67, 0.22], side: 'front' },
  { type: 'bloodPressureDia', position: [-0.46, 0.62, 0.22], side: 'front' },
  { type: 'bloodGlucose', position: [-0.14, 0.75, 0.32], side: 'front' },
  { type: 'bodyTemp', position: [0.28, 1.76, 0.2], side: 'front' },
  { type: 'sleepHours', position: [0.1, 1.98, 0.2], side: 'front' },
  { type: 'radiationDose', position: [-0.28, 1.45, 0.27], side: 'front' },
]

const metricSystem: Record<HealthType, string> = {
  heartRate: 'KARDİYOVASKÜLER',
  bloodPressureSys: 'KARDİYOVASKÜLER',
  bloodPressureDia: 'KARDİYOVASKÜLER',
  spo2: 'SOLUNUM',
  bodyTemp: 'BAĞIŞIKLIK / TERMAL',
  bloodGlucose: 'METABOLİK',
  sleepHours: 'NÖRODAVRANIŞSAL',
  mood: 'NÖRODAVRANIŞSAL',
  radiationDose: 'RADYASYON',
}

const statusColor: Record<HealthStatus, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  missing: '#64748b',
}

const statusText: Record<HealthStatus, string> = {
  green: 'NORMAL',
  amber: 'DİKKAT',
  red: 'KRİTİK',
  missing: 'VERİ YOK',
}

function formatValue(type: HealthType, value: number | undefined) {
  if (value === undefined) return '—'
  if (type === 'bodyTemp' || type === 'sleepHours' || type === 'radiationDose') {
    return value.toFixed(1)
  }
  return String(value)
}

function FallbackFigure() {
  return (
    <svg className="body-fallback" viewBox="0 0 220 420" role="img" aria-label="Astronot vücut haritası">
      <circle cx="110" cy="48" r="29" />
      <path d="M75 91 Q110 72 145 91 L158 199 Q145 214 130 204 L126 150 L136 244 L129 364 L104 364 L99 248 L91 364 L66 364 L69 242 L84 150 L78 204 Q59 214 48 199 Z" />
      <path d="M78 103 L39 207 L54 214 L94 140 M142 103 L181 207 L166 214 L126 140" />
    </svg>
  )
}

function thinGalaxyPoints(root: Object3D) {
  let cloudIndex = 0
  root.traverse((object) => {
    if (!(object instanceof Points)) return

    const geometry = object.geometry
    const position = geometry.getAttribute('position')
    if (!position || geometry.index) return

    const selectedIndices: number[] = []
    for (let index = 0; index < position.count; index += 1) {
      let hash = Math.imul(index ^ Math.imul(cloudIndex + 1, 0x9e3779b9), 0x45d9f3b)
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
      hash ^= hash >>> 16
      if ((hash >>> 0) / 0x100000000 < 0.2) selectedIndices.push(index)
    }

    if (selectedIndices.length === 0) return
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.getAttribute(name)
      const sampledValues = attribute.array.slice(0, selectedIndices.length * attribute.itemSize)
      selectedIndices.forEach((sourceIndex, targetIndex) => {
        const sourceOffset = sourceIndex * attribute.itemSize
        sampledValues.set(
          attribute.array.subarray(sourceOffset, sourceOffset + attribute.itemSize),
          targetIndex * attribute.itemSize,
        )
      })
      geometry.setAttribute(
        name,
        new BufferAttribute(sampledValues, attribute.itemSize, attribute.normalized),
      )
    }
    geometry.computeBoundingSphere()
    cloudIndex += 1
  })
}

function disposeModelResources(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof Line) && !(object instanceof Points)) return

    geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const currentMaterial of objectMaterials) {
      materials.add(currentMaterial)
      for (const value of Object.values(currentMaterial)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
  })

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
}

export function ThreeBodyMap({
  environment,
  statuses,
  values,
  selected,
  focused,
  onSelect,
}: ThreeBodyMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const statusesRef = useRef(statuses)
  const selectedRef = useRef(selected)
  const onSelectRef = useRef(onSelect)
  const rotationTargetRef = useRef(new Vector2())
  const figureRef = useRef<Group | null>(null)
  const zoomRef = useRef(1)
  const labelRefs = useRef(new Map<HealthType, HTMLDivElement>())
  const lineRefs = useRef(new Map<HealthType, SVGPathElement>())
  const targetRefs = useRef(new Map<HealthType, SVGGElement>())
  const visibleLabelsRef = useRef<HealthType[]>([])
  const [unavailable, setUnavailable] = useState(false)

  statusesRef.current = statuses
  selectedRef.current = selected
  onSelectRef.current = onSelect
  const visibleLabels = focused === selected ? [selected] : []
  visibleLabelsRef.current = visibleLabels

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true })
    } catch (error) {
      console.error('The 3D body map could not start WebGL.', error)
      setUnavailable(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(36, 1, 0.1, 100)
    camera.position.set(0, 0.15, 7.1)
    const cameraGoal = camera.position.clone()
    const focusGoal = new Vector3(0, 0.15, 0)
    const cameraFocus = focusGoal.clone()
    const projectedPosition = new Vector3()
    scene.add(new AmbientLight('#e0f2fe', 1.25))

    const keyLight = new DirectionalLight('#ffffff', 2)
    keyLight.position.set(-3, 5, 5)
    scene.add(keyLight)
    const fillLight = new DirectionalLight('#93c5fd', 0.8)
    fillLight.position.set(3, 2, 4)
    scene.add(fillLight)
    const rimPointLight = new PointLight('#38bdf8', 3, 9)
    rimPointLight.position.set(2, 0.5, -2)
    scene.add(rimPointLight)

    const galaxy = new Group()
    galaxy.position.copy(camera.position)
    galaxy.rotation.x = 0.5
    galaxy.scale.set(1.8, 2.4, 2.4)
    scene.add(galaxy)

    const figure = new Group()
    figureRef.current = figure
    scene.add(figure)
    let disposed = false
    let modelFailed = false

    const loader = new GLTFLoader()
    loader.load(
      '/models/milky-way-galaxy.glb',
      (gltf) => {
        if (disposed) {
          disposeModelResources(gltf.scene)
          return
        }

        thinGalaxyPoints(gltf.scene)
        gltf.scene.traverse((object) => {
          if (!(object instanceof Points)) return
          const pointMaterials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of pointMaterials) {
            if (!(material instanceof PointsMaterial)) continue
            material.size = 1.5
            material.needsUpdate = true
          }
        })
        galaxy.add(gltf.scene)
      },
      undefined,
      (error) => {
        if (!disposed) console.error('The Milky Way background could not be loaded.', error)
      },
    )

    loader.load(
      '/models/astronaut.glb',
      (gltf) => {
        if (disposed) {
          disposeModelResources(gltf.scene)
          return
        }

        gltf.scene.traverse((object) => {
          if (!(object instanceof Mesh)) return

          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of meshMaterials) {
            material.transparent = false
            material.opacity = 1
            material.depthWrite = true
            material.needsUpdate = true
          }
        })

        const human = new Group()
        human.add(gltf.scene)
        human.updateMatrixWorld(true)
        const bounds = new Box3().setFromObject(human)
        const size = bounds.getSize(new Vector3())
        const center = bounds.getCenter(new Vector3())
        if (size.y <= 0) {
          console.error('The astronaut model has invalid dimensions.')
          disposeModelResources(human)
          modelFailed = true
          setUnavailable(true)
          return
        }

        const scale = 3.5 / size.y
        human.scale.setScalar(scale)
        human.position.set(-center.x * scale, -1.5 - bounds.min.y * scale, -center.z * scale)
        figure.add(human)
      },
      undefined,
      (error) => {
        if (disposed) return
        console.error('The astronaut model could not be loaded.', error)
        modelFailed = true
        setUnavailable(true)
      },
    )

    const scanlineGeometry = new BufferGeometry()
    scanlineGeometry.setFromPoints([new Vector3(-0.74, 0, 0.16), new Vector3(0.74, 0, 0.16)])
    const scanline = new Line(scanlineGeometry, new LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }))
    scanline.renderOrder = 4
    scene.add(scanline)

    const hotspotMeshes = new Map<HealthType, Mesh>()
    for (const marker of markers) {
      const material = new MeshStandardMaterial({
        color: statusColor[statusesRef.current[marker.type]],
        emissive: statusColor[statusesRef.current[marker.type]],
        emissiveIntensity: 1.2,
        roughness: 0.25,
        depthTest: false,
      })
      const mesh = new Mesh(new SphereGeometry(0.074, 16, 12), material)
      mesh.position.set(...marker.position)
      mesh.renderOrder = 5
      mesh.visible = false
      mesh.userData.type = marker.type
      figure.add(mesh)
      hotspotMeshes.set(marker.type, mesh)

      const halo = new Mesh(
        new TorusGeometry(0.105, 0.008, 6, 24),
        new MeshBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.6,
          depthTest: false,
        }),
      )
      halo.position.copy(mesh.position)
      halo.renderOrder = 4
      halo.visible = false
      figure.add(halo)
    }

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const dragStart = new Vector2()
    const previousPointer = new Vector2()
    const targetRotation = rotationTargetRef.current
    let activePointerId: number | null = null
    let dragged = false
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      activePointerId = event.pointerId
      dragged = false
      dragStart.set(event.clientX, event.clientY)
      previousPointer.copy(dragStart)
      renderer.domElement.setPointerCapture(event.pointerId)
      host.classList.add('is-dragging')
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return

      const currentPointer = new Vector2(event.clientX, event.clientY)
      if (!dragged && currentPointer.distanceTo(dragStart) > 4) dragged = true
      if (dragged) {
        targetRotation.y += (event.clientX - previousPointer.x) * 0.01
        targetRotation.x = Math.max(
          -0.22,
          Math.min(0.22, targetRotation.x + (event.clientY - previousPointer.y) * 0.004),
        )
      }
      previousPointer.copy(currentPointer)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return

      if (!dragged) {
        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects([...hotspotMeshes.values()], false)[0]
        const type = hit?.object.userData.type as HealthType | undefined
        if (type) onSelectRef.current(type)
      }
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }
      activePointerId = null
      host.classList.remove('is-dragging')
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return
      activePointerId = null
      host.classList.remove('is-dragging')
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel)

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    })
    resizeObserver.observe(host)

    let animationFrame = 0
    let previousFrameTime = performance.now()
    const renderFrame = () => {
      if (modelFailed) return
      const now = performance.now()
      const deltaSeconds = Math.min((now - previousFrameTime) / 1000, 0.05)
      previousFrameTime = now
      figure.rotation.y = MathUtils.damp(figure.rotation.y, targetRotation.y, 2.2, deltaSeconds)
      figure.rotation.x = MathUtils.damp(figure.rotation.x, targetRotation.x, 2.8, deltaSeconds)
      galaxy.rotation.y += (figure.rotation.y - galaxy.rotation.y) * 0.04 + 0.00012
      galaxy.rotation.x += (figure.rotation.x + 0.5 - galaxy.rotation.x) * 0.04
      scanline.position.y = 2.2 - ((now % 5600) / 5600) * 3.85
      figure.updateMatrixWorld()
      focusGoal.set(0, 0.15, 0)
      cameraGoal.set(0, 0.15, 7.1 * zoomRef.current)
      camera.position.lerp(cameraGoal, 0.055)
      cameraFocus.lerp(focusGoal, 0.075)
      camera.lookAt(cameraFocus)
      galaxy.position.copy(camera.position)

      for (const [type, mesh] of hotspotMeshes) {
        const material = mesh.material as MeshStandardMaterial
        const color = statusColor[statusesRef.current[type]]
        material.color.set(color)
        material.emissive.set(color)
        const pulse = type === selectedRef.current ? 1.25 : 1
        mesh.scale.setScalar(pulse + Math.sin(now * 0.004) * 0.05)
      }
      const width = host.clientWidth
      const height = host.clientHeight
      if (width > 0 && height > 0) {
        camera.updateMatrixWorld()
        visibleLabelsRef.current.forEach((type) => {
          lineRefs.current.get(type)?.setAttribute('visibility', 'hidden')
          targetRefs.current.get(type)?.setAttribute('visibility', 'hidden')
        })
        const labelPositions = visibleLabelsRef.current.map((type) => {
          const mesh = hotspotMeshes.get(type)
          if (!mesh) return null
          mesh.getWorldPosition(projectedPosition)
          projectedPosition.project(camera)
          return {
            type,
            x: ((projectedPosition.x + 1) / 2) * width,
            y: ((-projectedPosition.y + 1) / 2) * height,
            depth: projectedPosition.z,
          }
        }).filter((position): position is { type: HealthType; x: number; y: number; depth: number } =>
          position !== null && position.depth < 1,
        ).sort((left, right) => left.y - right.y)

        labelPositions.forEach((position) => {
          const label = labelRefs.current.get(position.type)
          const line = lineRefs.current.get(position.type)
          const target = targetRefs.current.get(position.type)
          if (!label || !line || !target) return
          const labelWidth = label.offsetWidth
          const labelHeight = label.offsetHeight
          const yOffset = Math.min(92, labelHeight * 0.78)
          const labelY = Math.min(
            height - labelHeight / 2 - 12,
            Math.max(
              labelHeight / 2 + 12,
              position.y + (position.y < height * 0.5 ? yOffset : -yOffset),
            ),
          )
          const clearLeft = position.x - 12 >= labelWidth + 24
          const clearRight = width - position.x - 12 >= labelWidth + 24
          const cardOnLeft = clearLeft && (!clearRight || position.x > width * 0.5)
          const labelX = cardOnLeft ? 12 + labelWidth : width - labelWidth - 12
          const direction = cardOnLeft ? 1 : -1
          const curve = Math.min(54, Math.max(28, Math.abs(position.x - labelX) * 0.38))
          const toLabelX = labelX - position.x
          const toLabelY = labelY - position.y
          const labelDistance = Math.hypot(toLabelX, toLabelY) || 1
          const tipGap = 11
          const tipX = position.x + (toLabelX / labelDistance) * tipGap
          const tipY = position.y + (toLabelY / labelDistance) * tipGap
          label.style.left = `${labelX}px`
          label.style.top = `${labelY}px`
          label.classList.toggle('hud-label-left', cardOnLeft)
          line.setAttribute(
            'd',
            `M ${labelX} ${labelY} C ${labelX + direction * curve} ${labelY}, ${tipX - (toLabelX / labelDistance) * curve} ${tipY - (toLabelY / labelDistance) * curve}, ${tipX} ${tipY}`,
          )
          line.setAttribute('stroke', statusColor[statusesRef.current[position.type]])
          line.setAttribute('marker-end', 'url(#body-map-arrow)')
          line.setAttribute('visibility', 'visible')
          target.setAttribute('transform', `translate(${position.x} ${position.y})`)
          target.style.color = statusColor[statusesRef.current[position.type]]
          target.setAttribute('visibility', 'visible')
        })
      }
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(renderFrame)
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomRef.current = Math.max(0.7, Math.min(1.7, zoomRef.current + event.deltaY * 0.001))
    }
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })
    renderFrame()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('wheel', handleWheel)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel)
      disposed = true
      figureRef.current = null
      disposeModelResources(scene)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const marker = markers.find(({ type }) => type === selected)
    if (!marker) return

    const currentRotation = figureRef.current?.rotation.y ?? rotationTargetRef.current.y
    const desiredRotation = marker.side === 'back' ? Math.PI : 0
    rotationTargetRef.current.set(
      0,
      currentRotation + Math.atan2(
        Math.sin(desiredRotation - currentRotation),
        Math.cos(desiredRotation - currentRotation),
      ),
    )
  }, [selected])

  function adjustZoom(amount: number) {
    zoomRef.current = Math.max(0.7, Math.min(1.7, zoomRef.current + amount))
  }

  function resetZoom() {
    zoomRef.current = 1
  }

  return (
    <div className={`body-map-stage mission-scene-${environment}`} data-testid={`mission-scenery-${environment}`}>
      <div className="body-map-grid" aria-hidden="true" />
      <div
        className={`three-canvas ${unavailable ? 'is-unavailable' : ''}`}
        data-selected-view={markers.find(({ type }) => type === selected)?.side ?? 'front'}
        ref={hostRef}
        data-testid="body-map-canvas"
      >
        {!unavailable && (
          <>
            <svg className="body-map-leaders" aria-hidden="true">
              <defs>
                <marker
                  id="body-map-arrow"
                  markerHeight="10"
                  markerWidth="10"
                  orient="auto"
                  refX="8"
                  refY="5"
                >
                  <path
                    d="M1 1 8 5 1 9"
                    fill="none"
                    stroke="context-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                </marker>
              </defs>
              {visibleLabels.map((type) => (
                <g key={type}>
                  <path
                    ref={(element) => {
                      if (element) lineRefs.current.set(type, element)
                      else lineRefs.current.delete(type)
                    }}
                    className="body-map-leader"
                    data-testid={`body-map-leader-${type}`}
                    visibility="hidden"
                  />
                  <g
                    ref={(element) => {
                      if (element) targetRefs.current.set(type, element)
                      else targetRefs.current.delete(type)
                    }}
                    className="body-map-target"
                    data-testid={`body-map-target-${type}`}
                    visibility="hidden"
                  >
                    <circle className="body-map-target-pulse" r="10" />
                    <circle className="body-map-target-ring" r="5.5" />
                    <circle className="body-map-target-core" r="2" />
                  </g>
                </g>
              ))}
            </svg>
            <div className="body-map-hud-labels" aria-label="Seçilen vücut bölgesi">
              {visibleLabels.map((type) => (
                <div
                  className={`body-map-hud-label status-${statuses[type]} ${type === selected ? 'is-selected' : ''}`}
                  data-testid={`body-hud-${type}`}
                  key={type}
                  ref={(element) => {
                    if (element) labelRefs.current.set(type, element)
                    else labelRefs.current.delete(type)
                  }}
                >
                  <span>{metricSystem[type]}</span>
                  <strong className="body-map-hud-title">
                    {type === 'spo2' ? 'OKSİJEN · SpO₂' : metricDefinitions[type].label}
                  </strong>
                  <span className="body-map-hud-reading">
                    <strong>{formatValue(type, values[type])} {metricDefinitions[type].displayUnit}</strong>
                    <span className={`body-map-hud-status status-${statuses[type]}`}>
                      {statusText[statuses[type]]}
                    </span>
                  </span>
                  {type === 'spo2' && (
                    <span className="body-map-hud-tank">Tüp oksijeni · VERİ BEKLENİYOR</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="map-zoom-controls" aria-label="Kamera yakınlaştırma kontrolleri">
        <button
          aria-label="Yakınlaştır"
          data-testid="body-map-zoom-in"
          onClick={() => adjustZoom(-0.12)}
          type="button"
        >
          +
        </button>
        <button
          aria-label="Uzaklaştır"
          data-testid="body-map-zoom-out"
          onClick={() => adjustZoom(0.12)}
          type="button"
        >
          −
        </button>
        <button
          aria-label="Yakınlaştırmayı sıfırla"
          data-testid="body-map-zoom-reset"
          onClick={resetZoom}
          type="button"
        >
          1:1
        </button>
      </div>
      {unavailable && (
        <div className="body-map-fallback">
          <FallbackFigure />
          <span>3D görünüm kullanılamıyor · ölçümler aşağıdan seçilebilir</span>
        </div>
      )}
      <span className="map-axis map-axis-top">ANTHROPOMETRY / LIVE</span>
      <span className="body-map-drag-hint" aria-hidden="true">SÜRÜKLE / 360°</span>
      <span className="map-axis map-axis-bottom">
        {focused ? 'SEÇİLİ GÖSTERGE · NOKTA ODAĞI' : 'GENEL GÖRÜNÜM · TÜM VÜCUT'}
      </span>
      <div className="body-map-tags" aria-label="Vücut haritası göstergeleri">
        {(['heartRate', 'spo2', 'sleepHours', 'radiationDose'] as HealthType[]).map((type) => (
          <button
            className={`map-tag status-${statuses[type]} ${selected === type ? 'is-selected' : ''}`}
            data-testid={`body-hotspot-${type}`}
            key={type}
            onClick={() => onSelect(type)}
            type="button"
          >
            <span className="status-dot" />
            {metricDefinitions[type].shortLabel}
          </button>
        ))}
      </div>
    </div>
  )
}
