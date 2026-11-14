import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  healthTypes,
  metricDefinitions,
  type HealthStatus,
  type HealthType,
} from '../domain/types'

interface ThreeBodyMapProps {
  statuses: Record<HealthType, HealthStatus>
  values: Record<HealthType, number | undefined>
  selected: HealthType
  focused: HealthType | null
  onSelect: (type: HealthType) => void
}

const markers: { type: HealthType; position: [number, number, number] }[] = [
  { type: 'mood', position: [0.09, 1.52, 0.2] },
  { type: 'heartRate', position: [-0.08, 0.67, 0.3] },
  { type: 'spo2', position: [0.17, 0.91, 0.28] },
  { type: 'bloodPressureSys', position: [-0.34, 0.58, 0.18] },
  { type: 'bloodPressureDia', position: [0.34, 0.58, 0.18] },
  { type: 'bloodGlucose', position: [0, 0.08, 0.28] },
  { type: 'bodyTemp', position: [0.18, 0.28, 0.28] },
  { type: 'sleepHours', position: [-0.1, 1.62, 0.17] },
  { type: 'radiationDose', position: [0, -0.73, 0.18] },
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
  green: '#52e6b2',
  amber: '#ffbd5b',
  red: '#ff657a',
  missing: '#8795a7',
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

function createHumanSilhouette(material: MeshStandardMaterial) {
  const human = new Group()
  const createPart = (drawShape: (shape: Shape) => void) => {
    const shape = new Shape()
    drawShape(shape)
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      curveSegments: 16,
    })
    geometry.translate(0, 0, -0.1)
    human.add(new Mesh(geometry, material))
  }

  const createLeg = (side: -1 | 1) => {
    createPart((shape) => {
      shape.moveTo(side * 0.04, -0.3)
      shape.bezierCurveTo(side * 0.13, -0.31, side * 0.29, -0.34, side * 0.3, -0.48)
      shape.bezierCurveTo(side * 0.32, -0.65, side * 0.28, -0.77, side * 0.29, -0.9)
      shape.bezierCurveTo(side * 0.3, -1.06, side * 0.25, -1.18, side * 0.25, -1.3)
      shape.lineTo(side * 0.39, -1.35)
      shape.bezierCurveTo(side * 0.4, -1.4, side * 0.36, -1.43, side * 0.3, -1.43)
      shape.lineTo(side * 0.13, -1.43)
      shape.bezierCurveTo(side * 0.09, -1.4, side * 0.11, -1.32, side * 0.11, -1.25)
      shape.lineTo(side * 0.1, -0.94)
      shape.bezierCurveTo(side * 0.1, -0.75, side * 0.08, -0.56, side * 0.04, -0.3)
      shape.closePath()
    })
  }

  createPart((shape) => {
    shape.moveTo(-0.09, 1.23)
    shape.lineTo(-0.1, 1.08)
    shape.bezierCurveTo(-0.22, 1.07, -0.37, 1.02, -0.48, 0.94)
    shape.bezierCurveTo(-0.55, 0.85, -0.5, 0.69, -0.44, 0.6)
    shape.bezierCurveTo(-0.39, 0.48, -0.34, 0.27, -0.29, 0.12)
    shape.bezierCurveTo(-0.25, -0.03, -0.31, -0.18, -0.35, -0.29)
    shape.bezierCurveTo(-0.26, -0.38, -0.13, -0.4, 0, -0.4)
    shape.bezierCurveTo(0.13, -0.4, 0.26, -0.38, 0.35, -0.29)
    shape.bezierCurveTo(0.31, -0.18, 0.25, -0.03, 0.29, 0.12)
    shape.bezierCurveTo(0.34, 0.27, 0.39, 0.48, 0.44, 0.6)
    shape.bezierCurveTo(0.5, 0.69, 0.55, 0.85, 0.48, 0.94)
    shape.bezierCurveTo(0.37, 1.02, 0.22, 1.07, 0.1, 1.08)
    shape.lineTo(0.09, 1.23)
    shape.closePath()
  })

  for (const side of [-1, 1] as const) {
    createPart((shape) => {
      shape.moveTo(side * 0.45, 0.91)
      shape.bezierCurveTo(side * 0.55, 0.86, side * 0.63, 0.73, side * 0.62, 0.62)
      shape.bezierCurveTo(side * 0.61, 0.49, side * 0.53, 0.28, side * 0.5, 0.14)
      shape.bezierCurveTo(side * 0.48, 0.04, side * 0.51, -0.07, side * 0.5, -0.16)
      shape.bezierCurveTo(side * 0.49, -0.23, side * 0.43, -0.25, side * 0.4, -0.19)
      shape.bezierCurveTo(side * 0.37, -0.1, side * 0.37, 0.02, side * 0.38, 0.13)
      shape.bezierCurveTo(side * 0.4, 0.32, side * 0.42, 0.53, side * 0.39, 0.63)
      shape.bezierCurveTo(side * 0.37, 0.74, side * 0.37, 0.83, side * 0.45, 0.91)
      shape.closePath()
    })
  }

  createLeg(-1)
  createLeg(1)

  const head = new Mesh(new SphereGeometry(0.19, 32, 24), material)
  head.scale.y = 1.22
  head.position.set(0, 1.47, 0)
  human.add(head)

  return human
}

export function ThreeBodyMap({
  statuses,
  values,
  selected,
  focused,
  onSelect,
}: ThreeBodyMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const statusesRef = useRef(statuses)
  const selectedRef = useRef(selected)
  const focusedRef = useRef(focused)
  const onSelectRef = useRef(onSelect)
  const labelRefs = useRef(new Map<HealthType, HTMLDivElement>())
  const lineRefs = useRef(new Map<HealthType, SVGLineElement>())
  const visibleLabelsRef = useRef<HealthType[]>([])
  const [unavailable, setUnavailable] = useState(false)

  statusesRef.current = statuses
  selectedRef.current = selected
  focusedRef.current = focused
  onSelectRef.current = onSelect
  const warningTypes = healthTypes
    .filter((type) => statuses[type] === 'red' || statuses[type] === 'amber')
    .sort((left, right) => {
      const priority = { red: 0, amber: 1 } as const
      const leftStatus = statuses[left]
      const rightStatus = statuses[right]
      return priority[leftStatus === 'red' ? 'red' : 'amber'] -
        priority[rightStatus === 'red' ? 'red' : 'amber']
    })
  const visibleLabels = [...new Set([selected, ...warningTypes])].slice(0, 3)
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
    const camera = new PerspectiveCamera(36, 1, 0.1, 50)
    camera.position.set(0, 0.15, 7.3)
    const cameraGoal = camera.position.clone()
    const focusGoal = new Vector3(0, 0.15, 0)
    const cameraFocus = focusGoal.clone()
    const projectedPosition = new Vector3()
    const worldPosition = new Vector3()
    scene.add(new AmbientLight('#a9d8e4', 2.2))

    const keyLight = new DirectionalLight('#b7f4ff', 3.2)
    keyLight.position.set(-3, 5, 5)
    scene.add(keyLight)
    const rimPointLight = new PointLight('#00d7f0', 13, 9)
    rimPointLight.position.set(2, 0.5, -2)
    scene.add(rimPointLight)

    const figure = new Group()
    scene.add(figure)

    const hologramMaterial = new MeshStandardMaterial({
      color: '#00d2ff',
      emissive: '#00566f',
      emissiveIntensity: 0.52,
      transparent: true,
      opacity: 0.22,
      roughness: 0.28,
      metalness: 0.12,
      depthWrite: false,
    })

    const rimLightMaterial = new ShaderMaterial({
      side: BackSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vPositionView;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vPositionView = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormalView;
        varying vec3 vPositionView;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vPositionView))), 2.2);
          gl_FragColor = vec4(0.08, 0.78, 1.0, rim * 0.78);
        }
      `,
    })
    const wireframeMaterial = new MeshBasicMaterial({
      color: '#70efff',
      wireframe: true,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
    })

    const human = createHumanSilhouette(hologramMaterial)
    const humanMeshes: Mesh[] = []
    human.traverse((object) => {
      if (object instanceof Mesh) humanMeshes.push(object)
    })
    for (const object of humanMeshes) {
      const rim = new Mesh(object.geometry, rimLightMaterial)
      rim.scale.setScalar(1.012)
      rim.renderOrder = 1
      object.add(rim)

      const wireframe = new Mesh(object.geometry, wireframeMaterial)
      wireframe.scale.setScalar(1.004)
      wireframe.renderOrder = 2
      object.add(wireframe)
    }
    figure.add(human)

    const scanRing = new Group()
    scanRing.position.set(0, -1.43, 0)
    scene.add(scanRing)
    const ringMaterial = new MeshBasicMaterial({
      color: '#47dcf2',
      transparent: true,
      opacity: 0.48,
      side: DoubleSide,
      depthWrite: false,
    })
    for (const radius of [0.34, 0.5, 0.72]) {
      const ring = new Mesh(new CircleGeometry(radius, 72), ringMaterial)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = radius === 0.5 ? 0.006 : 0
      scanRing.add(ring)
    }
    const radialPoints = []
    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2
      const innerRadius = index % 4 === 0 ? 0.57 : 0.65
      radialPoints.push(
        new Vector3(Math.cos(angle) * innerRadius, 0.008, Math.sin(angle) * innerRadius),
        new Vector3(Math.cos(angle) * 0.72, 0.008, Math.sin(angle) * 0.72),
      )
    }
    const radialGrid = new Line(
      new BufferGeometry().setFromPoints(radialPoints),
      new LineBasicMaterial({ color: '#46d8ed', transparent: true, opacity: 0.32 }),
    )
    scanRing.add(radialGrid)

    const scanlineGeometry = new BufferGeometry()
    scanlineGeometry.setFromPoints([new Vector3(-0.74, 0, 0.16), new Vector3(0.74, 0, 0.16)])
    const scanline = new Line(scanlineGeometry, new LineBasicMaterial({
      color: '#8bf7ff',
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
      })
      const mesh = new Mesh(new SphereGeometry(0.074, 16, 12), material)
      mesh.position.set(...marker.position)
      mesh.userData.type = marker.type
      figure.add(mesh)
      hotspotMeshes.set(marker.type, mesh)

      const halo = new Mesh(
        new TorusGeometry(0.105, 0.008, 6, 24),
        new MeshBasicMaterial({ color: '#93f4ff', transparent: true, opacity: 0.6 }),
      )
      halo.position.copy(mesh.position)
      figure.add(halo)
    }

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const handlePointerDown = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects([...hotspotMeshes.values()], false)[0]
      const type = hit?.object.userData.type as HealthType | undefined
      if (type) onSelectRef.current(type)
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

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
    const renderFrame = () => {
      figure.rotation.y = Math.sin(performance.now() * 0.00022) * 0.12
      scanRing.rotation.y += 0.0015
      scanline.position.y = 1.25 - ((performance.now() % 5600) / 5600) * 2.75
      figure.updateMatrixWorld()
      if (focusedRef.current) {
        hotspotMeshes.get(focusedRef.current)?.getWorldPosition(worldPosition)
        focusGoal.copy(worldPosition)
        cameraGoal.set(worldPosition.x * 0.28, worldPosition.y * 0.2 + 0.15, 3.9)
      } else {
        focusGoal.set(0, 0.15, 0)
        cameraGoal.set(0, 0.15, 7.3)
      }
      camera.position.lerp(cameraGoal, 0.055)
      cameraFocus.lerp(focusGoal, 0.075)
      camera.lookAt(cameraFocus)

      for (const [type, mesh] of hotspotMeshes) {
        const material = mesh.material as MeshStandardMaterial
        const color = statusColor[statusesRef.current[type]]
        material.color.set(color)
        material.emissive.set(color)
        const pulse = type === selectedRef.current ? 1.25 : 1
        mesh.scale.setScalar(pulse + Math.sin(performance.now() * 0.004) * 0.05)
      }
      const width = host.clientWidth
      const height = host.clientHeight
      if (width > 0 && height > 0) {
        camera.updateMatrixWorld()
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

        const minY = 35
        const maxY = height - 46
        const minGap = 44
        const yPositions = labelPositions.map(({ y }) => Math.min(maxY, Math.max(minY, y)))
        for (let index = 1; index < yPositions.length; index += 1) {
          yPositions[index] = Math.max(yPositions[index], yPositions[index - 1] + minGap)
        }
        const overflow = Math.max(0, yPositions[yPositions.length - 1] - maxY)
        if (overflow > 0) {
          for (let index = 0; index < yPositions.length; index += 1) {
            yPositions[index] -= overflow
          }
        }
        labelPositions.forEach((position, index) => {
          const label = labelRefs.current.get(position.type)
          const line = lineRefs.current.get(position.type)
          if (!label || !line) return
          const labelY = yPositions[index]
          const alignRight = position.x < width * 0.52
          const labelWidth = label.offsetWidth
          const labelX = alignRight
            ? Math.min(width - labelWidth - 12, Math.max(12, position.x + 15))
            : Math.min(width - 12, Math.max(labelWidth + 12, position.x - 15))
          label.style.left = `${labelX}px`
          label.style.top = `${labelY}px`
          label.classList.toggle('hud-label-left', !alignRight)
          line.setAttribute('x1', String(position.x))
          line.setAttribute('y1', String(position.y))
          line.setAttribute('x2', String(labelX + (alignRight ? 0 : -label.offsetWidth)))
          line.setAttribute('y2', String(labelY))
          line.setAttribute('stroke', statusColor[statusesRef.current[position.type]])
        })
      }
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(renderFrame)
    }
    renderFrame()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      hologramMaterial.dispose()
      wireframeMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className="body-map-stage">
      <div className="body-map-grid" aria-hidden="true" />
      {unavailable ? (
        <div className="body-map-fallback">
          <FallbackFigure />
          <span>3D görünüm kullanılamıyor · ölçümler aşağıdan seçilebilir</span>
        </div>
      ) : (
        <div className="three-canvas" ref={hostRef} data-testid="body-map-canvas">
          <svg className="body-map-leaders" aria-hidden="true">
            {visibleLabels.map((type) => (
              <line
                key={type}
                ref={(element) => {
                  if (element) lineRefs.current.set(type, element)
                  else lineRefs.current.delete(type)
                }}
                className="body-map-leader"
              />
            ))}
          </svg>
          <div className="body-map-hud-labels" aria-label="Seçili ve uyarı veren vücut bölgeleri">
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
                <strong>
                  {metricDefinitions[type].shortLabel} // {formatValue(type, values[type])} {metricDefinitions[type].displayUnit}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
      <span className="map-axis map-axis-top">ANTHROPOMETRY / LIVE</span>
      <span className="map-axis map-axis-bottom">
        {focused ? 'KAMERA ODAĞI · SEÇİLİ GÖSTERGE' : 'GENEL GÖRÜNÜM · TÜM VÜCUT'}
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
